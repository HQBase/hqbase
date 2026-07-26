# MCP

HQBase exposes a remote Streamable HTTP MCP endpoint at `/mcp`.

Clients discover OAuth metadata, register with supported redirect URIs, and use OAuth 2.1
authorization code flow with PKCE. The connected HQBase user must sign in and consent. Passwords,
Cloudflare grants, runtime secrets, and customer credentials never enter the MCP client.

MCP scopes never broaden workspace permissions. Every request intersects the granted scopes with
the user's current mailbox grants, role, ban state, and session validity.

Available tools cover listing accessible mailboxes, searching readable messages, reading message
content, changing message state, creating drafts, sending, and replying. Responses exclude setup
values, secrets, Cloudflare credentials, and attachment bytes. Content-free audit events record
successful state changes and sends.
