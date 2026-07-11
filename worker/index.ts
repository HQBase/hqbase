import { handleInboundEmail } from "./email/inbound";
import { consumeJobs } from "./jobs/consumer";
import type { WorkerEnv } from "./lib/env";
import { apiRoutes } from "./routes";

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return apiRoutes.fetch(request, env, ctx);
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
