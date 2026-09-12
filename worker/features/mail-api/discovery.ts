import mailApiV1DocumentSource from "../../../api/hqbase-mail-api-v1.openapi.json";
import mailApiDocumentSource from "../../../api/hqbase-mail-api-v2.openapi.json";

import { authOrigin } from "../../auth/auth";
import type { WorkerEnv } from "../../lib/env";

const humanMailSkillPath = "/skills/hqbase-mail/SKILL.md";
const mailboxAgentSkillPath = "/skills/hqbase-mailbox/SKILL.md";
const provisionerSkillPath = "/skills/hqbase-provisioner/SKILL.md";
const mailApiOpenApiPath = "/api/v2/openapi.json";
const mailApiOpenApiDocuments: ReadonlyMap<string, object> = new Map<string, object>([
  ["/api/v1/openapi.json", mailApiV1DocumentSource],
  [mailApiOpenApiPath, mailApiDocumentSource]
]);

const retiredAgentInstructionPaths = new Set(["/AGENTS.md", "/agents.md"]);

const publicDiscoveryCacheControl = "public, max-age=300";

export function handleMailApiDiscovery(request: Request, env: WorkerEnv): Response | null {
  const pathname = new URL(request.url).pathname;
  const isRetiredAgentInstructionPath = retiredAgentInstructionPaths.has(pathname);
  const openApiDocument = mailApiOpenApiDocuments.get(pathname);
  if (
    pathname !== humanMailSkillPath &&
    pathname !== mailboxAgentSkillPath &&
    pathname !== provisionerSkillPath &&
    !openApiDocument &&
    !isRetiredAgentInstructionPath
  ) {
    return null;
  }

  const headers = publicDiscoveryHeaders(
    openApiDocument ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8"
  );
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("allow", "GET, HEAD");
    return new Response(null, { status: 405, headers });
  }

  const origin = authOrigin(env, request);
  const responseBody = openApiDocument
    ? buildInstanceOpenApi(openApiDocument, origin)
    : pathname === humanMailSkillPath
      ? buildHumanMailSkill(origin)
      : pathname === mailboxAgentSkillPath
        ? buildMailboxAgentSkill(origin)
        : pathname === provisionerSkillPath
          ? buildProvisionerSkill(origin)
          : buildRetirementNotice();
  return new Response(request.method === "HEAD" ? null : responseBody, { headers });
}

function buildInstanceOpenApi(document: object, origin: string): string {
  return `${JSON.stringify(
    {
      ...document,
      servers: [{ url: origin, description: "This HQBase installation" }],
      externalDocs: {
        description: "Connect through the HQBase Mail API with human approval",
        url: `${origin}${humanMailSkillPath}`
      }
    },
    null,
    2
  )}\n`;
}

function buildHumanMailSkill(origin: string): string {
  const apiBase = `${origin}/api/v2`;
  const openApiUrl = `${origin}${mailApiOpenApiPath}`;
  const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource/api/v2`;
  const authorizationMetadataUrl = `${origin}/.well-known/oauth-authorization-server/api/auth`;

  return `---
name: hqbase-mail
description: Use human OAuth to operate mail available to a signed-in person in this HQBase installation.
---

# HQBase Mail for Your Account

Use this skill when a person asks an AI agent to work with mail available to their HQBase account. For a machine identity, use the separate mailbox-agent or provisioning skill shown under **Agents**.

## Instance

- Instance origin: ${origin}
- API base URL: ${apiBase}
- OpenAPI contract: ${openApiUrl}
- OAuth resource metadata: ${resourceMetadataUrl}
- OAuth authorization-server metadata: ${authorizationMetadataUrl}

The OpenAPI document is authoritative for query parameters, request bodies, response schemas, content types, and error codes. Fetch it before constructing a request. Do not guess payload shapes.

## Authentication

Use OAuth. Do not copy or reuse an HQBase browser session cookie.

1. Fetch the OAuth protected-resource metadata.
2. Fetch the advertised authorization-server metadata.
3. Register as a public OAuth client through the advertised registration endpoint. Use token endpoint authentication method \`none\`, include \`urn:ietf:params:oauth:grant-type:device_code\` in \`grant_types\`, and include \`${apiBase}\` in the client's \`resources\`. Add \`refresh_token\` to \`grant_types\` only when requesting \`offline_access\`.
4. POST form-encoded \`client_id\`, the minimum required \`scope\`, and \`resource=${apiBase}\` to the advertised \`device_authorization_endpoint\`.
5. Display the returned \`verification_uri_complete\` as a clickable link together with the \`user_code\`. Do not open, navigate to, or interact with the verification URL in Cloud Browser or any other remote, automated, or agent-controlled browser. The person must open it themselves in a browser they control, check that the displayed code and permissions match, and choose Allow or Deny. Do not ask for their password, cookies, or a token.
6. Poll the advertised token endpoint with form-encoded \`grant_type=urn:ietf:params:oauth:grant-type:device_code\`, \`device_code\`, \`client_id\`, and \`resource=${apiBase}\`. Wait at least the returned \`interval\` between attempts.
7. Continue polling after \`authorization_pending\`. Increase the wait after \`slow_down\`. Stop after success, \`access_denied\`, \`expired_token\`, or another terminal error.
8. Send the access token as \`Authorization: Bearer <access-token>\`.

Prefer Device Authorization for command-line tools and other clients that cannot safely receive a browser callback. A callback-capable client may instead register \`authorization_code\` and use Authorization Code with PKCE and the S256 challenge method. Both flows require the same resource, scopes, sign-in, and explicit approval.

Native desktop and mobile clients that use Authorization Code with PKCE must register with \`application_type\` set to \`native\`. HQBase accepts the native redirect forms defined by RFC 8252: app-claimed HTTPS, loopback HTTP, and private-use schemes. A private-use redirect must use a reverse-domain scheme with no authority component, for example \`com.example.mail:/oauth/callback\`.

Use this exact OAuth resource and token audience: \`${apiBase}\`. MCP uses separate audiences at \`${origin}/mcp\` and \`${origin}/mcp/full\`; an MCP token cannot be used with the Mail API.

Request only the permissions needed for the person's task. Add \`offline_access\` only when the client needs a refresh token.

${buildMailApiGuide(apiBase, openApiUrl)}
`;
}

function buildMailboxAgentSkill(origin: string): string {
  const apiBase = `${origin}/api/v2`;
  const openApiUrl = `${origin}${mailApiOpenApiPath}`;

  return `---
name: hqbase-mailbox
description: Operate one assigned HQBase mailbox with a mailbox-agent bearer credential.
---

# HQBase Mailbox Agent

Use this skill only with a mailbox-agent credential created in **Settings → Agents** or returned by an approved provisioner.

## Instance

- Instance origin: ${origin}
- API base URL: ${apiBase}
- OpenAPI contract: ${openApiUrl}

The OpenAPI document is authoritative for request and response shapes. Fetch it before constructing a request. Do not guess payload shapes.

## Authentication

Send the credential as \`Authorization: Bearer <agent-credential>\`. HQBase credentials currently start with \`hqb_agent_\`, but the prefix does not identify their permissions. This credential works only with the Mail API, only for its machine identity, and only while the agent and mailbox grant are active.

Do not exchange the credential through OAuth. Do not use it with MCP or the Management API. Never log it or put it in a prompt, URL, or mail content.

${buildMailApiGuide(apiBase, openApiUrl)}
`;
}

function buildMailApiGuide(apiBase: string, openApiUrl: string): string {
  return `## Permissions

- \`mail:read\` — List visible mailboxes, shared labels, and conversations; search and open messages; render message HTML; and download attachments.
- \`mail:write\` — Mark mail read or unread, add or remove labels and stars, archive or unarchive mail, move mail to Trash, and restore mail. A mailbox agent cannot change a person's remote-image trust preferences.
- \`mail:send\` — Create and manage drafts and attachments, send new messages, reply, and forward.
- \`signatures:manage\` — Human OAuth only: manage personal and shared signatures within the person's current management access. Machine credentials cannot use this permission.

Permissions do not override HQBase mailbox access. The caller must also have the necessary Read or Handle mail grant. Machine agents never inherit owner access or see unassigned catch-all mail. This API never grants Manager access.

## API contract

Fetch ${openApiUrl} for the available methods, parameters, payloads, action values, schemas, content types, and error responses.

## Operating rules

- Use \`Content-Type: application/json\` for JSON requests and \`multipart/form-data\` for draft attachment uploads.
- Treat message, conversation, draft-list, and change cursors as opaque strings and return them unchanged. Do not construct or edit a cursor.
- \`GET ${apiBase}/messages\` and \`GET ${apiBase}/drafts\` return one page. Follow the \`Link: <url>; rel="next"\` response header for the next page. No \`Link\` header means the last page.
- To start message synchronization, get a checkpoint from \`GET ${apiBase}/changes\` without a cursor, paginate the full message list, then read changes after the checkpoint until \`hasMore\` is false.
- To start draft synchronization, get a checkpoint from \`GET ${apiBase}/drafts/changes\` without a cursor, paginate the full draft list, then read draft changes after the checkpoint until \`hasMore\` is false.
- Open \`${apiBase}/events\` as a WebSocket when low-latency updates are useful. Each frame only identifies a changed topic. After a frame or reconnect, use the REST resources and change journals to reconcile state. Reconnect with bounded exponential backoff. Keep periodic synchronization as a fallback.
- List mailboxes before each change cycle. Remove cached mail for mailboxes that are no longer readable, and bootstrap each newly readable mailbox.
- List labels before applying one. A label organizes mail only; it never grants mailbox access or changes a folder.
- List signatures for the exact From address before selecting one. Omit the signature field when the supplied body must remain unchanged.
- Repeat a full draft bootstrap when mailbox access changes so newly hidden or visible drafts are reconciled.
- Ignore response fields you do not recognize.
- Do not log credentials, access tokens, refresh tokens, message bodies, or attachments.
- Do not send, reply, or forward unless that external action matches the authorized task.
- Sending, replying, and forwarding are not idempotent. Never retry them blindly.
- Use the returned draft version when updating a draft so newer work is not overwritten.
- A \`410 CHANGE_CURSOR_EXPIRED\` response requires a new full message bootstrap. A \`410 DRAFT_CHANGE_CURSOR_EXPIRED\` response requires a new full draft bootstrap.

## Errors

JSON errors contain a stable \`error.code\` and human-readable \`error.message\`. A missing or invalid credential returns \`401\`; insufficient permission or mailbox access returns \`403\`. Responses include \`X-Request-Id\`. Retain that identifier when reporting a failure, but never include credentials or private mail content.

## API boundary and stability

The Mail API covers mailboxes, messages, conversations, labels, signatures, attachments, drafts, sending, replying, and forwarding. It does not manage people, mailbox grants, label definitions, domains, setup, updates, audits, sessions, notifications, app secrets, or Cloudflare credentials.

\`/api/v2\` is HQBase's stable public Mail API. Additive fields and endpoints may appear, so ignore unknown response fields. Breaking changes use a new versioned base path such as \`/api/v3\`.
`;
}

function buildProvisionerSkill(origin: string): string {
  const managementBase = `${origin}/management/v1`;
  const mailboxSkillUrl = `${origin}${mailboxAgentSkillPath}`;

  return `---
name: hqbase-provisioner
description: Create and deprovision mailbox agents with a trusted HQBase provisioner credential.
---

# HQBase Provisioner

Use this skill only with a provisioner credential created in **Settings → Agents**. A provisioner is a trusted control-plane service because it receives every child mailbox credential that it creates.

## Instance

- Instance origin: ${origin}
- Management API base URL: ${managementBase}
- Child mailbox skill: ${mailboxSkillUrl}

## Authentication

Send the provisioner credential as \`Authorization: Bearer <provisioner-credential>\`. HQBase credentials currently start with \`hqb_agent_\`, but the prefix does not identify their permissions. The stored provisioner profile and \`mailbox:provision\` permission are authoritative.

This credential works only with the Management API. It cannot read or send mail and does not work with the Mail API or MCP. Never log the provisioner credential or a child credential, and never put one in a prompt, URL, or mail content.

## Create a mailbox agent

Send one JSON request to \`POST ${managementBase}/agents\`:

\`\`\`json
{
  "profile": "mailbox",
  "name": "Orders agent",
  "accessLevel": "agent",
  "mailbox": {
    "address": "orders-agent@example.com",
    "displayName": "Orders agent"
  }
}
\`\`\`

\`accessLevel\` is \`read\` or \`agent\`. The address must use the provisioner's approved domain. Each request creates one mailbox with that address, a mailbox agent, and its explicit grant. The provisioner's domain, status, active mailbox limit, and hourly rate limit still apply.

A successful response contains \`agent\` and the new \`credential\` once. Give the child agent its credential and ${mailboxSkillUrl} through a secure channel.

## Recover safely

- \`GET ${managementBase}/agents\` lists only mailbox agents created by this provisioner.
- \`POST ${managementBase}/agents/{agent-id}/credential\` creates a replacement credential for one listed child. The previous credential stops working immediately.
- \`DELETE ${managementBase}/agents/{agent-id}\` deprovisions one listed child. It soft-deletes the child's mailbox, disables the child, and revokes its credentials. Its stored mail stays available to an HQBase owner. Repeating this request is safe.

Mailbox creation is not idempotent. Never retry a create request blindly. If a response is lost, list the provisioner's agents first. If the child exists, replace its credential instead of creating the address again.

## Errors and boundaries

JSON errors contain a stable \`error.code\` and human-readable \`error.message\`. Retain \`X-Request-Id\` when reporting a failure, but never include credentials or private mail content. A provisioner cannot create another provisioner, use an existing mailbox, connect a domain, restore a mailbox, or manage an agent created by someone else.
`;
}

function buildRetirementNotice(): string {
  return `# HQBase AI connections

This file is retired. Open **Agents** in HQBase to choose the correct Agent Skill or MCP server.
`;
}

function publicDiscoveryHeaders(contentType: string): Headers {
  return new Headers({
    "access-control-allow-origin": "*",
    "cache-control": publicDiscoveryCacheControl,
    "content-type": contentType,
    "x-content-type-options": "nosniff"
  });
}
