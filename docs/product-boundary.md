# Community and Pro product boundary

HQBase Community is open source under AGPL-3.0-or-later. It remains a complete, useful shared
inbox that teams can self-host in their own Cloudflare account. Commercial use is permitted subject
to the AGPL, including its source-availability obligations for modified network software.

HQBase Pro is a separate complete product under the HQBase Commercial Source License. It is not a
runtime add-on, hidden feature flag, or permanently tracking fork of Community.

## Community owns

- Cloudflare-native deployment and setup, including OAuth with a manual-token fallback.
- Shared users and domain mailboxes in one workspace.
- Inbound and outbound mail, D1 metadata, and R2 mail objects.
- Basic owner, admin, and member roles with shared mailbox access.
- OAuth-protected baseline MCP access to the same shared mailbox behavior.
- Signed updates and operator tooling for development deployments.
- Generic, auditable purchase and in-place promotion orchestration that contains no Pro source,
  schema logic, licensing, or entitlement enforcement.

## Pro owns

- Per-mailbox access control and advanced team workflows.
- Multiple domains, aliases, richer composition, audit, retention, and recovery behavior.
- License activation and paid-administration policy.
- App passwords, persistent IMAP identity, and the private-preview mail bridge API.
- Fresh Pro installation and the Pro side of supported Community upgrades.

Community does not contain dormant Pro implementation, license checks, entitlement code, bridge
APIs, or Pro migrations. Cross-product security and correctness fixes are implemented and tested
deliberately in each affected repository.

## Contributions

The official Community repository may decline changes that add Pro product behavior, including
mailbox-level ACLs, private inboxes, advanced workflow, audit/compliance features, or bridge APIs.
Foundational security, accessibility, performance, testing, and deployment improvements remain
welcome. An AGPL fork may implement different behavior if it complies with the license and does not
misrepresent itself as official HQBase.

The code license does not grant rights to HQBase names or branding. See `TRADEMARKS.md`.
