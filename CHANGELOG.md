# Changelog

## 1.3.1

### Fixed

- Restore and validate the live-event Durable Object binding when an older supported updater builds
  this release, and stop an update if Cloudflare does not report all required bindings on the active
  Worker.
- Keep an open composer and its unsaved input stable during event reconnection, mailbox refresh, and
  fallback synchronization. A new composer no longer creates duplicate empty drafts during these
  refreshes.
- Return a safe service-unavailable response when live events are not configured or cannot connect.
  The app continues through the HTTP synchronization journals, and Worker logs contain only a safe
  diagnostic code and request ID.
- Test signed release candidates with the previous stable updater and verify the active bindings and
  authenticated event WebSocket before publication.

## 1.3.0

### New

- Add contacts and shared labels. Save private notes, review all accessible mail with a contact,
  use recipient suggestions, create labels from Inbox, and label or filter conversations and
  drafts.
- Add managed signatures and rich images. Set personal, mailbox, or domain signature defaults,
  preview them while writing, insert and resize inline images, and forward images with original
  attachments.
- Add dedicated mailbox agents with revocable credentials. Provisioners can create and remove
  dedicated mailbox agents within an approved domain and quota.
- Add global search and live mail refresh. Find mail, contacts, drafts, and app pages as you type,
  and see new mail and label changes without reloading.
- Add message-level actions. Reply to, forward, archive, restore, or move one message to Trash
  without changing the rest of its conversation.
- Add safer administration. Delete and restore mailboxes without deleting mail, remove and restore
  people while revoking old access, choose how each domain handles unknown addresses, and move
  HQBase to a new app domain.

### Changed

- Give each mailbox one email address and make Mail API v2 the default for new clients. It supports
  draft sync, labels, signatures, and live events. Mail API v1 remains available for existing
  clients.
- Improve Inbox and composer layouts with compact responsive controls, composer windows that stay
  open while you navigate and can be moved or resized, full visible reply history, safer
  remote-image controls, and release notes before updates.

## 1.2.0

### New

- Refresh the app with responsive rail and drawer navigation, canonical `/mail/*` routes, Inter
  typography, full-page conversation reading, and MCP and Agent Skill settings.
- Add opaque cursor pagination for message listings, with stable ordering and bounded pages.
- Add a durable `/api/v1/changes` feed with deletion tombstones and access-change records for
  reliable client synchronization.
- Make terminal installation and removal resumable with atomic resource checkpoints, live identity
  verification, preservation of reused resources, and fail-closed recovery for ambiguous state.
- Add forward, unarchive, and restore actions across the app, REST, and MCP, including optional
  forwarding of the original message's attachments.

### Fixed

- Fix catch-all messages being absent from conversations, REST, MCP, unread counts, push
  notifications, and the changes feed. Catch-all mail remains owner-only, and messages from a
  deleted mailbox do not become visible as catch-all mail.
- Return restored and unarchived messages to Inbox, Sent, or Catch-all according to their direction
  and assignment instead of moving every message to one folder.
- Reopen saved reply and forward drafts with their accessible conversation, preserve the exact
  target, keep the composer visible, and block sending when the target is missing or inaccessible.
- Correct send, reply, and forward authorization so valid mailbox sends work and source-message
  access is checked against the correct resource.
- Allow refresh-token retries during the configured rotation window without invalidating the token
  family.
- Preserve attachment media types through draft upload and forwarding, and document the attachment
  size limits in the public API contract.
- Block direct HTTP access to Better Auth admin endpoints so an admin cannot promote themselves to
  owner or replace an owner's password outside HQBase's owner-only controls.
- Show the requesting OAuth client's ID and homepage on the consent page, and clarify native PKCE
  registration so people can verify the client before approval.
- Prevent Reply from addressing the workspace sender, repair compact Settings navigation, and wait
  for mail actions to finish before showing success.
- Clarify that conversation action routes take the conversation's latest message ID, not its thread
  ID, in the Agent Skill, OpenAPI document, and Postman collection.

## 1.1.2

- Add secure self-service password recovery from the sign-in page. Recovery links expire after
  seven days, work once, invalidate older unused password links, and revoke existing sessions after
  a successful reset.
- Keep generated customer deployments on their configured hostname by disabling preview URLs.
- Post complete release notes to the configured Discord webhook only after the signed release and
  public archive pass verification. Discord delivery failures do not invalidate a release.
- Improve the repository README so installation, documentation, community, contribution, security,
  and local-development paths are easier to find.

## 1.1.1

- Publish the deployment-local Mail API instructions as a valid Agent Skill at
  `/skills/hqbase-mail/SKILL.md`, add Copy and Download Skill actions, and redirect the earlier
  `/AGENTS.md` and `/agents.md` paths.

## 1.1.0

- Add a stable, versioned Mail API for mailboxes, messages, conversations, attachments, drafts,
  sending, and replies. API clients can use audience-bound OAuth bearer tokens, while the web app
  uses the same `/api/v1` routes with its existing session cookie.
- Publish deployment-local `AGENTS.md`, OpenAPI 3.1, and Postman artifacts so people and AI agents
  can discover, inspect, and test each installation's API without an HQBase-specific SDK.
- Add OAuth Device Authorization for agents and command-line clients, including normal-browser
  approval, short-lived single-use codes, scoped access, and persistent D1-backed verification
  rate limits.
- Expand **Connect AI agent** to offer both the existing MCP connection and the deployment's
  `AGENTS.md` instructions, while keeping REST and MCP tokens isolated by audience.
- Add deterministic local D1 reset and seed commands for a ready-to-use development workspace.
- Improve Windows installation and release-script compatibility, protect temporary secret files,
  route Worker-owned paths ahead of the SPA fallback, and exercise the quality gate on Windows CI.

## 1.0.1

- Preserve invitation password setup links so `/set-password?token=...` reaches the password form
  instead of being normalized to the inbox.

## 1.0.0

- Publish HQBase as one free and open-source shared email workspace for customer-owned Cloudflare
  infrastructure, with one signed public release and update channel.
- Support multiple email domains, shared mailboxes, aliases, catch-all delivery, drafts,
  conversations, replies, forwarding, attachments, and Gmail-compatible quoted history.
- Enforce owner, admin, member, and mailbox-level read, agent, and manager access throughout the app
  and OAuth-protected MCP endpoints.
- Provide responsive desktop, mobile, and installable PWA experiences with mailbox filtering,
  notifications, offline handling, update readiness, and device-safe layouts.
- Keep setup, domain management, updates, backup, restore, diagnostics, and resource removal inside
  the customer Cloudflare account.
- Use the verified public Cloudflare OAuth client by default and support private customer-managed
  OAuth clients with Authorization Code and PKCE, without client secrets or pasted API tokens.
- Verify signed release manifests and artifact digests before deployment, with compatibility
  checks, D1 recovery bookmarks, Worker rollback details, and staging lifecycle coverage.
