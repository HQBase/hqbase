# Architecture

HQBase is a Cloudflare-native SPA plus Worker API.

## Request Flow

Static assets are built by Vite into `dist` and served by the Worker assets binding. API requests use `/api/*` and are routed by Hono before SPA asset handling, including top-level browser navigations. SPA routes fall back to the asset handler.

## Auth Flow

Better Auth is mounted at `/api/auth/*` and stores users, sessions, accounts, and verification records in D1. Public signup is blocked at the HTTP route. The setup route creates the first owner through Better Auth internally. The owner's account email is an authentication and recovery identity independent of the workspace domain and never creates a mailbox implicitly. Owner/admin users can create more users.

## MCP Flow

The installed Worker exposes a stateless Streamable HTTP MCP endpoint at `/mcp`. Better Auth is the
OAuth 2.1 authorization server for public MCP clients, with PKCE, dynamic registration, explicit
consent, and hashed opaque access tokens stored in the workspace. MCP tools reuse the same D1
queries, validation, and outbound mail services as the web API. Community mailboxes remain shared;
MCP does not add mailbox ACLs.
See [MCP](mcp.md).

## Inbound Email Flow

Cloudflare Email Routing delivers mail to the Worker `email(message, env, ctx)` handler. HQBase uses the SMTP envelope recipient, not only the `To:` header. Raw `.eml` is written to R2, metadata is parsed with Postal MIME, attachments are written to R2, and message metadata is written to D1.

Known mailbox recipients land in `inbox`. Unknown recipients land in `catchall`.

## Outbound Email Flow

The compose API validates the selected active mailbox, calls the Cloudflare Email Sending binding, then stores a sent message in D1. Replies include `Message-ID`, `Date`, `In-Reply-To`, and `References` headers.

## Storage Model

D1 stores setup settings, mailboxes, threads, messages, attachment metadata, and Better Auth tables. R2 stores large or raw objects: raw inbound emails, HTML bodies, attachments, and outbound HTML bodies.
