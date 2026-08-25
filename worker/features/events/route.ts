import { MailApiAuthError, mailApiChallenge, requireMailApiPrincipal } from "../../auth/mail-api";
import type { WorkerEnv } from "../../lib/env";
import { AppError, errorBody, toAppError } from "../../lib/errors";
import { jsonResponse } from "../../lib/json";

import { mailEventInternalHeaders } from "./durable-object";
import type { MailEventTopic } from "./types";

const eventPaths = new Set(["/api/v1/events", "/api/v2/events"]);
const workspaceHubName = "workspace";

export async function handleMailEventRoute(
  request: Request,
  env: WorkerEnv
): Promise<Response | null> {
  if (!eventPaths.has(new URL(request.url).pathname)) return null;

  const requestId = requestIdFor(request);
  try {
    if (request.method !== "GET") {
      return eventError("METHOD_NOT_ALLOWED", "Use GET to open the event WebSocket.", 405, {
        allow: "GET",
        "x-request-id": requestId
      });
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return eventError("WEBSOCKET_UPGRADE_REQUIRED", "Request a WebSocket upgrade.", 426, {
        upgrade: "websocket",
        "x-request-id": requestId
      });
    }

    const principal = await requireMailApiPrincipal(env, request, "mail:read");
    validateSessionOrigin(request, principal.authentication);
    const topics: MailEventTopic[] = ["messages", "mailboxes", "labels"];
    if (principal.scopes.has("mail:send")) topics.push("drafts");

    const headers = new Headers({ upgrade: "websocket" });
    headers.set(mailEventInternalHeaders.requestId, requestId);
    headers.set(mailEventInternalHeaders.topics, topics.join(","));
    headers.set(mailEventInternalHeaders.user, principal.principal.id);
    const response = await env.MAIL_EVENTS.getByName(workspaceHubName).fetch(
      new Request(request.url, { headers })
    );
    if (response.status !== 101) {
      return eventError("EVENT_CONNECTION_FAILED", "The event connection failed.", 503, {
        "x-request-id": requestId
      });
    }
    return response;
  } catch (error) {
    const appError = toAppError(error);
    const headers: Record<string, string> = { "x-request-id": requestId };
    if (error instanceof MailApiAuthError) {
      headers["www-authenticate"] = mailApiChallenge(env, request, error);
    }
    return eventError(appError.code, appError.message, appError.status, headers);
  }
}

function validateSessionOrigin(
  request: Request,
  authentication: "agent" | "bearer" | "session"
): void {
  if (authentication !== "session") return;
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) {
    throw new AppError("ORIGIN_FORBIDDEN", "WebSocket origin is not allowed.", 403);
  }
}

function requestIdFor(request: Request): string {
  const provided = request.headers.get("x-request-id") ?? "";
  return /^[A-Za-z0-9_-]{8,100}$/.test(provided) ? provided : crypto.randomUUID();
}

function eventError(
  code: string,
  message: string,
  status: number,
  headers: HeadersInit = {}
): Response {
  return jsonResponse(errorBody(code, message), {
    status,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      ...Object.fromEntries(new Headers(headers))
    }
  });
}
