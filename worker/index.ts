import { sql } from "drizzle-orm";

import { handleMailApiMetadata } from "./auth/mail-api";
import { getRow } from "./db/drizzle";
import { handleInboundEmail } from "./email/inbound";
import { MailEvents } from "./features/events/durable-object";
import { handleMailEventRoute } from "./features/events/route";
import { ignoreMailEventFailure, publishMessageMailEvent } from "./features/events/service";
import { handleMailApiDiscovery } from "./features/mail-api/discovery";
import { handleMcpRoute } from "./features/mcp/route";
import { notifyInboundMessage } from "./features/notifications/delivery";
import { consumeJobs } from "./jobs/consumer";
import type { WorkerEnv } from "./lib/env";
import { apiRoutes } from "./routes";

export { MailEvents };

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const mailApiDiscovery = handleMailApiDiscovery(request, env);
    if (mailApiDiscovery) return mailApiDiscovery;
    const mailApiMetadata = handleMailApiMetadata(request, env);
    if (mailApiMetadata) return mailApiMetadata;
    const mailEventResponse = await handleMailEventRoute(request, env);
    if (mailEventResponse) return mailEventResponse;
    const mcpResponse = await handleMcpRoute(request, env, ctx);
    if (mcpResponse) return mcpResponse;
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/management/")) {
      return apiRoutes.fetch(request, env, ctx);
    }

    const portal = request.headers.get("accept")?.includes("text/html")
      ? await getRow<{ is_canonical: number; canonical_hostname: string }>(
          env.DB,
          sql`SELECT current.is_canonical, canonical.hostname AS canonical_hostname
       FROM workspace_hosts current
       JOIN workspace_hosts canonical ON canonical.kind = 'portal' AND canonical.is_canonical = 1
       WHERE current.kind = 'portal' AND current.hostname = ${url.hostname.toLowerCase()}`
        ).catch(() => null)
      : null;
    if (portal && portal.is_canonical !== 1) {
      url.hostname = portal.canonical_hostname;
      return Response.redirect(url.toString(), 308);
    }

    return env.ASSETS.fetch(request);
  },

  async email(
    message: ForwardableEmailMessage,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    const stored = await handleInboundEmail(message, env);
    if (stored.inserted) {
      ctx.waitUntil(
        notifyInboundMessage(env, stored.message, stored.isUnassigned).catch(() => {
          // Push delivery is additive and never changes accepted inbound mail.
        })
      );
      ctx.waitUntil(
        ignoreMailEventFailure(
          publishMessageMailEvent(env, [
            { isUnassigned: stored.isUnassigned, mailboxId: stored.message.mailboxId }
          ])
        )
      );
    }
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv): Promise<void> {
    if (!env.HQBASE_JOBS) throw new Error("HQBASE_JOBS binding is required.");
    const requestedAt = new Date().toISOString();
    await env.HQBASE_JOBS.send({
      id: `maintenance:${requestedAt.slice(0, 10)}`,
      kind: "maintenance",
      requestedAt
    });
    await env.HQBASE_JOBS.send({
      id: `integrity:${requestedAt.slice(0, 10)}`,
      kind: "integrity-scan",
      requestedAt
    });
  },

  async queue(batch: MessageBatch<import("./jobs/types").Job>, env: WorkerEnv): Promise<void> {
    await consumeJobs(batch, env);
  }
};
