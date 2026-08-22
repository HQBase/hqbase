import mailApiDocumentSource from "../../../api/hqbase-mail-api-v1.openapi.json";

import { authOrigin } from "../../auth/auth";
import type { WorkerEnv } from "../../lib/env";

export const agentSkillPath = "/skills/hqbase-mail/SKILL.md";
export const mailApiOpenApiPath = "/api/v1/openapi.json";

const legacyAgentInstructionPaths = new Set(["/AGENTS.md", "/agents.md"]);

const publicDiscoveryCacheControl = "public, max-age=300";
const apiMethods = ["get", "post", "patch", "delete"] as const;

type ApiMethod = (typeof apiMethods)[number];
type OpenApiOperation = {
  security?: Array<{ oauth2?: string[] }>;
  summary?: string;
  tags?: string[];
};
type OpenApiDocument = {
  paths: Record<string, Partial<Record<ApiMethod, OpenApiOperation>>>;
};

const mailApiDocument: OpenApiDocument = mailApiDocumentSource;
const mailApiMethodIndex = buildMethodIndex(mailApiDocument);

export function handleMailApiDiscovery(request: Request, env: WorkerEnv): Response | null {
  const pathname = new URL(request.url).pathname;
  const isLegacyAgentInstructionPath = legacyAgentInstructionPaths.has(pathname);
  if (
    pathname !== agentSkillPath &&
    pathname !== mailApiOpenApiPath &&
    !isLegacyAgentInstructionPath
  ) {
    return null;
  }

  const headers = publicDiscoveryHeaders(
    pathname === mailApiOpenApiPath
      ? "application/json; charset=utf-8"
      : "text/markdown; charset=utf-8"
  );
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("allow", "GET, HEAD");
    return new Response(null, { status: 405, headers });
  }

  const origin = authOrigin(env, request);
  if (isLegacyAgentInstructionPath) {
    headers.set("location", `${origin}${agentSkillPath}`);
    return new Response(null, { status: 308, headers });
  }

  const responseBody =
    pathname === agentSkillPath ? buildAgentSkill(origin) : buildInstanceOpenApi(origin);
  return new Response(request.method === "HEAD" ? null : responseBody, { headers });
}

function buildInstanceOpenApi(origin: string): string {
  return `${JSON.stringify(
    {
      ...mailApiDocumentSource,
      servers: [{ url: origin, description: "This HQBase installation" }],
      externalDocs: {
        description: "Connect an AI agent to this HQBase installation",
        url: `${origin}${agentSkillPath}`
      }
    },
    null,
    2
  )}\n`;
}

function buildAgentSkill(origin: string): string {
  const apiBase = `${origin}/api/v1`;
  const openApiUrl = `${origin}${mailApiOpenApiPath}`;
  const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource/api/v1`;
  const authorizationMetadataUrl = `${origin}/.well-known/oauth-authorization-server/api/auth`;

  return `---
name: hqbase-mail
description: Connect to and operate this HQBase installation through its Mail API. Use when a person asks to read, search, organize, draft, or send mail in HQBase.
---

# HQBase Mail

This document explains how an AI agent can connect to and operate this HQBase installation through its public Mail API.

## Instance

- Instance origin: ${origin}
- API base URL: ${apiBase}
- OpenAPI contract: ${openApiUrl}
- OAuth resource metadata: ${resourceMetadataUrl}
- OAuth authorization-server metadata: ${authorizationMetadataUrl}

The OpenAPI document is authoritative for query parameters, request bodies, response schemas, content types, and error codes. Fetch it before constructing a request. Do not guess payload shapes.

## Authentication

External agents must use an OAuth bearer token. Do not copy or reuse an HQBase browser session cookie.

1. Fetch the OAuth protected-resource metadata.
2. Fetch the advertised authorization-server metadata.
3. Register as a public OAuth client through the advertised registration endpoint. Use token endpoint authentication method \`none\`, include \`urn:ietf:params:oauth:grant-type:device_code\` in \`grant_types\`, and include \`${apiBase}\` in the client's \`resources\`. Add \`refresh_token\` to \`grant_types\` only when requesting \`offline_access\`.
4. POST form-encoded \`client_id\`, the minimum required \`scope\`, and \`resource=${apiBase}\` to the advertised \`device_authorization_endpoint\`.
5. Display the returned \`verification_uri_complete\` as a clickable link together with the \`user_code\`. Do not open, navigate to, or interact with the verification URL in Cloud Browser or any other remote, automated, or agent-controlled browser. The person must open it themselves in a browser they control, check that the displayed code and permissions match, and choose Allow or Deny. Do not ask for their password, cookies, or a token.
6. Poll the advertised token endpoint with form-encoded \`grant_type=urn:ietf:params:oauth:grant-type:device_code\`, \`device_code\`, \`client_id\`, and \`resource=${apiBase}\`. Wait at least the returned \`interval\` between attempts.
7. Continue polling after \`authorization_pending\`. Increase the wait after \`slow_down\`. Stop after success, \`access_denied\`, \`expired_token\`, or another terminal error.
8. Send the access token as \`Authorization: Bearer <access-token>\`.

Prefer Device Authorization for agents, command-line tools, and other clients that cannot safely receive a browser callback. A callback-capable client may instead register \`authorization_code\` and use Authorization Code with PKCE and the S256 challenge method. Both flows require the same resource, scopes, sign-in, and explicit approval.

Native desktop and mobile clients that use Authorization Code with PKCE must register with \`application_type\` set to \`native\`. HQBase accepts the native redirect forms defined by RFC 8252: app-claimed HTTPS, loopback HTTP, and private-use schemes. A private-use redirect must use a reverse-domain scheme with no authority component, for example \`com.example.mail:/oauth/callback\`.

Use this exact OAuth resource and token audience: \`${apiBase}\`. MCP uses separate audiences at \`${origin}/mcp\` and \`${origin}/mcp/full\`; an MCP token cannot be used with the Mail API.

## Permissions

- \`mail:read\` — List visible mailboxes and conversations, search and open messages, render message HTML, and download attachments.
- \`mail:write\` — Mark mail read or unread, add or remove stars, archive or unarchive mail, move mail to Trash, restore mail, and trust remote images from a sender.
- \`mail:send\` — Create and manage drafts and attachments, send new messages, reply, and forward.
- \`offline_access\` — Request an optional refresh token. This is not an API endpoint permission.

OAuth permissions do not override HQBase mailbox access. The connected person must also have the necessary Read or Agent mailbox grant. This API never grants Manager access.

## API methods

${mailApiMethodIndex}

The method index is an orientation aid. Consult ${openApiUrl} for exact parameters, payloads, action values, and schemas.

## Operating rules

- Use \`Content-Type: application/json\` for JSON requests and \`multipart/form-data\` for draft attachment uploads.
- Treat message, conversation, draft-list, and change cursors as opaque strings and return them unchanged. Do not construct or edit a cursor.
- \`GET ${apiBase}/messages\` and \`GET ${apiBase}/drafts\` return one page. Follow the \`Link: <url>; rel="next"\` response header for the next page. No \`Link\` header means the last page.
- To start message synchronization, get a checkpoint from \`GET ${apiBase}/changes\` without a cursor, paginate the full message list, then read changes after the checkpoint until \`hasMore\` is false.
- To start draft synchronization, get a checkpoint from \`GET ${apiBase}/drafts/changes\` without a cursor, paginate the full draft list, then read draft changes after the checkpoint until \`hasMore\` is false.
- Open \`${apiBase}/events\` as a WebSocket when low-latency updates are useful. Each frame only identifies a changed topic. After a frame or reconnect, use the REST resources and change journals to reconcile state. Reconnect with bounded exponential backoff. Keep periodic synchronization as a fallback.
- List mailboxes before each change cycle. Remove cached mail for mailboxes that are no longer readable, and bootstrap each newly readable mailbox.
- Repeat a full draft bootstrap when mailbox access changes so newly hidden or visible drafts are reconciled.
- Ignore response fields you do not recognize.
- Do not log access tokens, refresh tokens, message bodies, or attachments.
- Do not log device codes or user codes, and do not paste them into unrelated chats or tools.
- Do not send, reply, or forward unless that external action matches the person's request.
- Sending, replying, and forwarding are not idempotent. Never retry them blindly.
- Use the returned draft version when updating a draft so newer work is not overwritten.
- A \`410 CHANGE_CURSOR_EXPIRED\` response requires a new full message bootstrap. A \`410 DRAFT_CHANGE_CURSOR_EXPIRED\` response requires a new full draft bootstrap.

## Errors

JSON errors contain a stable \`error.code\` and human-readable \`error.message\`. A missing or invalid token returns \`401\`; insufficient OAuth scope or mailbox access returns \`403\`. Responses include \`X-Request-Id\`. Retain that identifier when reporting a failure, but never include credentials or private mail content.

## API boundary and stability

The Mail API covers mailboxes, messages, conversations, attachments, drafts, sending, replying, and forwarding. It does not manage people, mailbox grants, domains, setup, updates, audits, sessions, notifications, app secrets, or Cloudflare credentials.

\`/api/v1\` is HQBase's stable public Mail API. Additive fields and endpoints may appear, so ignore unknown response fields. Breaking changes use a new versioned base path such as \`/api/v2\`.
`;
}

function buildMethodIndex(document: OpenApiDocument): string {
  const groups = new Map<string, string[]>();
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of apiMethods) {
      const operation = pathItem[method];
      if (!operation) continue;
      const tag = operation.tags?.[0] ?? "Mail API";
      const scopes = [
        ...new Set(operation.security?.flatMap((security) => security.oauth2 ?? []) ?? [])
      ];
      const permission = scopes.length > 0 ? ` Requires \`${scopes.join(" ")}\`.` : "";
      const description = operation.summary ? ` — ${operation.summary}.` : ".";
      const entries = groups.get(tag) ?? [];
      entries.push(`- \`${method.toUpperCase()} ${path}\`${description}${permission}`);
      groups.set(tag, entries);
    }
  }

  return [...groups.entries()]
    .map(([tag, entries]) => `### ${tag}\n\n${entries.join("\n")}`)
    .join("\n\n");
}

function publicDiscoveryHeaders(contentType: string): Headers {
  return new Headers({
    "access-control-allow-origin": "*",
    "cache-control": publicDiscoveryCacheControl,
    "content-type": contentType,
    "x-content-type-options": "nosniff"
  });
}
