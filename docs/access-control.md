# Mailbox access

HQBase Pro denies mailbox data unless the user is the workspace owner or has an explicit grant.

| Grant | Read mail | Send and reply | Change shared state | IMAP writes / SMTP | Retention |
| --- | --- | --- | --- | --- | --- |
| None | No | No | No | No | No |
| Read | Yes | No | No | No | No |
| Agent | Yes | Yes | Yes | Yes | No |
| Manager | Yes | Yes | Yes | Yes | Yes |

Owners have implicit manager access to every mailbox. Admins can manage users and grants, but need
their own mailbox grant to read content. Settings → Access is the operator surface. Changing a
grant revokes that user's active bridge sessions so clients must authenticate against the new
policy.

The same decision is enforced by web message APIs, attachments, send/reply, IMAP materialization,
raw MIME reads, IMAP mutations, and SMTP submission.
