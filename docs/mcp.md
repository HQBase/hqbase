# MCP

HQBase Pro includes a remote Model Context Protocol server at:

```text
https://<your-workspace-host>/mcp
```

Use that URL in a client that supports remote Streamable HTTP MCP. The client automatically
discovers the workspace's OAuth 2.1 authorization server, registers with PKCE, and opens HQBase for
sign-in and consent. Your password, Pro secrets, Cloudflare installation grant, and Cloudflare
credentials are never given to the MCP client.

## Scopes and grants

- `mail:read`: list, search, and open mail only where the user currently has `read`, `agent`, or
  `manager` mailbox access.
- `mail:write`: change message state only where the user currently has `agent` or `manager` access.
- `mail:send`: send and reply only where the user currently has `agent` or `manager` access.
- `offline_access`: let the client refresh its connection until access is revoked.

OAuth scopes never broaden Pro permissions. Grant changes, role changes, bans, session expiry, and
session revocation are checked against live workspace state.

## Tools

- `list_mailboxes`
- `search_messages`
- `get_message`
- `update_message`
- `send_email`
- `reply_to_message`

Search results are bounded. MCP does not return raw email, stored HTML, remote media, inline media,
attachment bytes, audit history, billing, setup values, secrets, bridge operations, or Cloudflare
credentials. Successful state changes, sends, and replies create content-free Pro audit events.
