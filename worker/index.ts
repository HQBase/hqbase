import { handleInboundEmail } from "./email/inbound";
import { refreshWorkspaceEntitlement } from "./features/billing/service";
import { consumeJobs } from "./jobs/consumer";
import type { WorkerEnv } from "./lib/env";
import { apiRoutes } from "./routes";

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
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
    _ctx: ExecutionContext
  ): Promise<void> {
    await handleInboundEmail(message, env);
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv): Promise<void> {
    await refreshWorkspaceEntitlement(env);
    if (!env.PRO_JOBS) throw new Error("PRO_JOBS binding is required.");
    const requestedAt = new Date().toISOString();
    await env.PRO_JOBS.send({
      id: `maintenance:${requestedAt.slice(0, 10)}`,
      kind: "maintenance",
      requestedAt
    });
    await env.PRO_JOBS.send({
      id: `integrity:${requestedAt.slice(0, 10)}`,
      kind: "integrity-scan",
      requestedAt
    });
  },

  async queue(batch: MessageBatch<import("./jobs/types").ProJob>, env: WorkerEnv): Promise<void> {
    await consumeJobs(batch, env);
  }
};
