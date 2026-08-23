import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import type { WorkerEnv } from "../../lib/env";
import type { MailEventScheduler } from "../events/service";
import { registerDraftTools } from "./draft-tools";
import { registerMailTools } from "./mail-tools";
import type { McpPrincipal } from "./route";
import { registerSendTools } from "./send-tools";

export async function serveMcp(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
  principal: McpPrincipal
): Promise<Response> {
  const server = new McpServer({ name: "HQBase", version: "2.0.0" });
  const schedule: MailEventScheduler = (promise) => ctx.waitUntil(promise);
  registerTools(server, env, principal, schedule);
  const url = new URL(request.url);
  const transport = new WebStandardStreamableHTTPServerTransport({
    allowedOrigins: [url.origin],
    enableDnsRebindingProtection: true,
    enableJsonResponse: true
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

function registerTools(
  server: McpServer,
  env: WorkerEnv,
  principal: McpPrincipal,
  schedule: MailEventScheduler
): void {
  registerMailTools(server, env, principal, schedule);
  registerDraftTools(server, env, principal, schedule);
  registerSendTools(server, env, principal, schedule);
}
