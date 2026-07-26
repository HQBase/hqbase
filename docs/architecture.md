# Architecture

HQBase is a single Cloudflare-native shared email workspace. The customer deployment owns the
Worker, D1 database, R2 bucket, queues, routes, runtime secrets, mail, and workspace data.

The Worker serves the web application and authenticated APIs, processes Cloudflare Email Routing
messages, stores searchable metadata in D1 and MIME or attachment objects in R2, and dispatches
background work through Cloudflare Queues.

Access is workspace-based: owners and administrators manage people and mailbox grants; members see
only mailboxes granted to them. MCP uses OAuth 2.1 with PKCE and intersects requested scopes with the
same live mailbox grants.

Installation and updates consume signed public artifacts from GitHub Releases. A short-lived
Cloudflare OAuth grant may mutate customer resources. It is encrypted in the customer deployment,
scoped to the operation, and revoked afterward. Customer Cloudflare credentials are never copied
to an HQBase service.
