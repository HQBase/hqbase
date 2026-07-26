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
