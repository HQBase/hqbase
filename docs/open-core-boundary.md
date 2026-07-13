# Open Core Boundary

This document explains the intended boundary between HQBase OSS and future commercial HQBase offerings. It is product policy, not legal advice.

## License Position

HQBase OSS is licensed under AGPL-3.0-or-later.

The OSS repository is intended to remain a complete, useful, self-hosted shared inbox for teams that want to run HQBase in their own Cloudflare account.

AGPL protects the openness of the core code. It does not prevent competition, and it does not require commercial users to pay for the OSS edition. It does require modified AGPL versions to comply with AGPL, including source availability obligations for network use.

## OSS Core

The open-source core should include:

- Cloudflare-native deployment.
- Deploy to Cloudflare support.
- Setup wizard.
- OAuth-powered Cloudflare setup with manual API-token fallback for self-hosters and forks.
- Better Auth integration.
- Shared users in one workspace.
- Shared domain mailboxes.
- Inbound email through Cloudflare Email Routing / Email Service.
- Outbound email through Cloudflare Email Service.
- D1 metadata storage.
- R2 raw email, HTML body, and attachment storage.
- Basic owner/admin/member roles.
- Basic mailbox management.
- Tests, migrations, and self-hosting docs.
- Operator tooling needed to install, reset, inspect, and destroy development deployments.

The OSS core intentionally uses a simple permission model:

- All users can view all mailboxes.
- All users can send from active mailboxes.
- Owner/admin users can manage users and mailboxes.

## Commercial Pro Boundary

Future HQBase Pro features may be commercial and source-available under a separate license.

Features likely reserved for Pro include:

- Per-mailbox permissions.
- Private user inboxes.
- Team or group access controls.
- Thread assignment.
- Internal notes.
- Collision detection for replies.
- Audit logs.
- Compliance exports.
- Retention policies.
- Advanced rules and automations.
- Multi-domain administration.
- Managed onboarding and migration tooling.
- Priority support workflows.

This boundary is based on buyer value. Features needed to operate a serious team inbox with controlled access, auditability, and supportability are commercial candidates.

## Contributions That Overlap Pro

The maintainers may decline OSS pull requests that implement, approximate, or expose future Pro functionality.

Examples of PRs that may be declined from OSS:

- Adding mailbox-level ACLs to the core app.
- Adding private inboxes to the core app.
- Adding assignment or internal-note workflow to the core app.
- Adding audit-log or compliance features to the core app.
- Adding dormant Pro code paths, flags, or license checks to the OSS app.

Maintainers may still accept narrower PRs that improve shared foundations without shipping the commercial feature itself, such as:

- Refactoring policy checks.
- Improving tests.
- Clarifying extension boundaries.
- Fixing security bugs.
- Improving accessibility or performance.

Declining a PR from the official OSS repository does not prevent someone from maintaining an AGPL fork, as long as they comply with the license and do not misrepresent the fork as official HQBase.

## Pro Code Separation

Do not mix commercial Pro implementation code into the AGPL OSS repository unless the intended license impact has been reviewed first.

Prefer clear separation:

- OSS core exposes stable public extension points.
- Pro code lives in a private repository or separately licensed package.
- Pro features are not hidden in OSS behind disabled flags.
- Generated artifacts, private license keys, customer secrets, and private package credentials are never committed to this repository.

## Brand Boundary

The AGPL code license does not grant rights to use the HQBase name, logos, or branding in a way that suggests an unofficial fork is the official project.

Forks should use a distinct name and clearly state that they are not affiliated with or endorsed by HQBase.

See `TRADEMARKS.md` for brand-use guidance.
