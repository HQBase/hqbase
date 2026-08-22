import { DurableObject } from "cloudflare:workers";

import type { WorkerEnv } from "../../lib/env";

import {
  type MailEventConnection,
  type MailEventPublish,
  type MailEventTopic,
  mailEventTopics
} from "./types";

const connectionLifetimeMs = 10 * 60 * 1000;
const maxConnectionsPerUser = 3;
const maxWorkspaceConnections = 1_000;
const internalUserHeader = "x-hqbase-event-user";
const internalTopicsHeader = "x-hqbase-event-topics";
const internalRequestIdHeader = "x-hqbase-event-request-id";

export class MailEvents extends DurableObject<WorkerEnv> {
  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required.", { status: 426 });
    }

    const userId = request.headers.get(internalUserHeader);
    const topics = parseTopics(request.headers.get(internalTopicsHeader));
    if (!userId || topics.length === 0) {
      return new Response("Authenticated event context required.", { status: 403 });
    }

    let connections = this.liveConnections(Date.now());
    const userTag = `user:${userId}`;
    const existing = connections.filter((socket) => readConnection(socket)?.userId === userId);
    if (existing.length >= maxConnectionsPerUser) {
      const replaced = existing.sort(
        (left, right) =>
          (readConnection(left)?.expiresAt ?? 0) - (readConnection(right)?.expiresAt ?? 0)
      )[0];
      replaced?.close(1008, "A newer connection replaced this one.");
      if (replaced) connections = connections.filter((socket) => socket !== replaced);
    }
    if (connections.length >= maxWorkspaceConnections) {
      return new Response("Event connection capacity reached.", { status: 503 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const connection: MailEventConnection = {
      expiresAt: Date.now() + connectionLifetimeMs,
      topics,
      userId
    };
    this.ctx.acceptWebSocket(server, [...topics, userTag]);
    server.serializeAttachment(connection);
    await this.scheduleExpiryAlarm(connection.expiresAt);

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-request-id": request.headers.get(internalRequestIdHeader) ?? crypto.randomUUID()
      }
    });
  }

  async publish(input: MailEventPublish): Promise<void> {
    if (!mailEventTopics.includes(input.topic) || input.userIds.length === 0) return;

    const recipients = new Set(input.userIds);
    const payload = JSON.stringify({ type: "changed", topic: input.topic });
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets(input.topic)) {
      const connection = readConnection(socket);
      if (!connection || !recipients.has(connection.userId)) continue;
      if (connection.expiresAt <= now) {
        socket.close(1008, "Reconnect to renew authentication.");
        continue;
      }
      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "Event delivery failed.");
      }
    }
  }

  override async webSocketMessage(socket: WebSocket): Promise<void> {
    socket.close(1008, "Client messages are not supported.");
  }

  override async alarm(): Promise<void> {
    const connections = this.liveConnections(Date.now());
    const nextExpiry = connections.reduce<number | null>((earliest, socket) => {
      const expiresAt = readConnection(socket)?.expiresAt;
      if (expiresAt === undefined) return earliest;
      return earliest === null ? expiresAt : Math.min(earliest, expiresAt);
    }, null);
    if (nextExpiry !== null) await this.ctx.storage.setAlarm(nextExpiry);
  }

  private liveConnections(now: number): WebSocket[] {
    const live: WebSocket[] = [];
    for (const socket of this.ctx.getWebSockets()) {
      const connection = readConnection(socket);
      if (!connection || connection.expiresAt <= now) {
        socket.close(1008, "Reconnect to renew authentication.");
        continue;
      }
      live.push(socket);
    }
    return live;
  }

  private async scheduleExpiryAlarm(expiresAt: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || expiresAt < current) await this.ctx.storage.setAlarm(expiresAt);
  }
}

export const mailEventInternalHeaders = {
  requestId: internalRequestIdHeader,
  topics: internalTopicsHeader,
  user: internalUserHeader
} as const;

function parseTopics(value: string | null): MailEventTopic[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((topic) => topic.trim())
        .filter((topic): topic is MailEventTopic =>
          mailEventTopics.includes(topic as MailEventTopic)
        )
    )
  ];
}

function readConnection(socket: WebSocket): MailEventConnection | null {
  const value: unknown = socket.deserializeAttachment();
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MailEventConnection>;
  if (
    typeof candidate.userId !== "string" ||
    typeof candidate.expiresAt !== "number" ||
    !Array.isArray(candidate.topics)
  ) {
    return null;
  }
  const topics = candidate.topics.filter(
    (topic): topic is MailEventTopic =>
      typeof topic === "string" && mailEventTopics.includes(topic as MailEventTopic)
  );
  return { expiresAt: candidate.expiresAt, topics, userId: candidate.userId };
}
