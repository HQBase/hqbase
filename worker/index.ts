import { handleInboundEmail } from "./email/inbound";
import { handleMcpRoute } from "./features/mcp/route";
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

    return env.ASSETS.fetch(request);
  },

  async email(
    message: ForwardableEmailMessage,
    env: WorkerEnv,
    _ctx: ExecutionContext
  ): Promise<void> {
    await handleInboundEmail(message, env);
  }
};
