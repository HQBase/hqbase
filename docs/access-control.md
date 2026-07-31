# Mailbox access

HQBase denies mailbox data unless the user is the workspace owner or has an explicit grant.

| Grant | Read mail | Send and reply | Change shared state | Retention |
| --- | --- | --- | --- | --- |
| None | No | No | No | No |
| Read | Yes | No | No | No |
| Agent | Yes | Yes | Yes | No |
| Manager | Yes | Yes | Yes | Yes |

Owners have implicit manager access to every mailbox. Administrators can manage users and grants,
but need their own mailbox grant to read content. Changing a grant takes effect on the next
authenticated request.

The same decision is enforced by web message APIs, attachment access, sending, replies, raw MIME
reads, and MCP tools.

## User onboarding

A user's unique Login email is used for authentication and recovery. Its account must remain
accessible even when HQBase is unavailable, so it cannot use a domain connected to this workspace.
It is not a shared mailbox address and never grants mailbox access.

Owners and admins can add a user in two ways:

- Send a seven-day, single-use email invitation so the user chooses a password.
- Create the user directly and share the server-generated temporary password through a secure
  channel.

Both paths keep workspace and MCP APIs unavailable until password setup is complete. New users
still require explicit mailbox grants afterward. Lost or expired invitations can be resent, and a
lost temporary password can be regenerated while the user remains pending.
