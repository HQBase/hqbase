# MCP

HQBase exposes a remote Streamable HTTP MCP endpoint at `/mcp`.

Clients discover OAuth metadata, register with supported redirect URIs, and use OAuth 2.1
authorization code flow with PKCE. The connected HQBase user must sign in and consent. Passwords,
Cloudflare grants, runtime secrets, and customer credentials never enter the MCP client.

MCP scopes never broaden workspace permissions. Every request intersects the granted scopes with
the user's current mailbox grants, role, ban state, and session validity.

New dynamically registered clients default to `mail:read`, `mail:write`, and `mail:send` so clients
that omit registration scopes receive the complete mail surface after explicit consent. A client
may request less access, and existing clients or consents are never silently broadened. Revoke and
reconnect an older read-only client to register it with the new defaults.

## Tools

`mail:read` provides:

- `list_mailboxes`
- `search_messages`
- `list_conversations`
- `get_message`
- `get_thread`
- `get_attachment`

`mail:write` provides:

- `update_message`
- `update_conversation`

`mail:send` provides:

- `list_drafts`
- `get_draft`
- `create_draft`
- `update_draft`
- `delete_draft`
- `add_draft_attachment`
- `remove_draft_attachment`
- `send_email`
- `reply_to_message`
- `forward_message`

Drafts use revision numbers to prevent silent overwrites. Send and reply accept plain text with
optional HTML and staged draft attachment IDs. Forwarding creates the forwarded context on the
server and can retain the original message attachments.

Messages expose safe attachment metadata without storage keys. `get_attachment` returns an MCP
embedded resource and `add_draft_attachment` accepts base64 content. Each MCP binary transfer is
limited to 10 MiB; HQBase's existing total attachment and recipient limits still apply.

HQBase records successful state changes, draft and attachment mutations, sends, replies, and
forwards as content-free audit events. MCP does not expose setup values, secrets, Cloudflare
credentials, user or workspace administration, infrastructure operations, or a new-mail
subscription.
