import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import type { WorkerEnv } from "../../lib/env";
import { registerDraftTools } from "./draft-tools";
import { registerMailTools } from "./mail-tools";
import type { McpPrincipal } from "./route";
import { registerSendTools } from "./send-tools";

export async function serveMcp(
  request: Request,
  env: WorkerEnv,
  _ctx: ExecutionContext,
  principal: McpPrincipal
): Promise<Response> {
  const server = new McpServer({ name: "HQBase", version: "1.0.0" });
  registerTools(server, env, principal);
  const url = new URL(request.url);
  const transport = new WebStandardStreamableHTTPServerTransport({
    allowedOrigins: [url.origin],
    enableDnsRebindingProtection: true,
    enableJsonResponse: true
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

function registerTools(server: McpServer, env: WorkerEnv, principal: McpPrincipal): void {
  registerMailTools(server, env, principal);
  registerDraftTools(server, env, principal);
  registerSendTools(server, env, principal);
}
