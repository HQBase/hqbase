import { handleInboundEmail } from "./email/inbound";
import { handleMcpRoute } from "./features/mcp/route";
import { notifyInboundMessage } from "./features/notifications/delivery";
import { consumeJobs } from "./jobs/consumer";
import type { WorkerEnv } from "./lib/env";
import { apiRoutes } from "./routes";

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const mcpResponse = await handleMcpRoute(request, env, ctx);
    if (mcpResponse) return mcpResponse;
    if (url.pathname.startsWith("/api/")) {
      return apiRoutes.fetch(request, env, ctx);
    }

    const portal = request.headers.get("accept")?.includes("text/html")
      ? await env.DB.prepare(
          `SELECT current.is_canonical, canonical.hostname AS canonical_hostname
       FROM workspace_hosts current
       JOIN workspace_hosts canonical ON canonical.kind = 'portal' AND canonical.is_canonical = 1
       WHERE current.kind = 'portal' AND current.hostname = ?`
        )
          .bind(url.hostname.toLowerCase())
          .first<{ is_canonical: number; canonical_hostname: string }>()
          .catch(() => null)
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
        notifyInboundMessage(env, stored.message).catch(() => {
          // Push delivery is additive and never changes accepted inbound mail.
        })
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
