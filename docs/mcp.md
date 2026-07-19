# MCP

HQBase Community includes a remote Model Context Protocol server at:

```text
https://<your-workspace-host>/mcp
```

Use that URL in a client that supports remote Streamable HTTP MCP. The client automatically
discovers the workspace's OAuth 2.1 authorization server, registers with PKCE, and opens HQBase for
sign-in and consent. Your password, Cloudflare setup grant, and Cloudflare credentials are never
given to the MCP client.

## Scopes

- `mail:read`: list shared mailboxes, search messages, and open stored plain-text message bodies and
  safe attachment metadata.
- `mail:write`: mark read/unread, star/unstar, archive, and move messages to trash.
- `mail:send`: send plain-text messages and replies from active shared mailboxes.
- `offline_access`: let the client refresh its connection until access is revoked.

Community applies its normal shared-inbox rules after OAuth scope checks. OAuth does not introduce
per-mailbox privacy or Pro behavior.

## Tools

- `list_mailboxes`
- `search_messages`
- `get_message`
- `update_message`
- `send_email`
- `reply_to_message`

Search results are bounded. MCP does not return raw email, stored HTML, remote media, inline media,
attachment bytes, setup values, secrets, or Cloudflare credentials. Disconnect or revoke the
connection in the MCP client to stop refresh-token access; signing out or revoking the HQBase
session also blocks the connection.
