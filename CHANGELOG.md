# Changelog

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
