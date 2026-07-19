# HQBase Pro

Private source repository for the complete HQBase Pro product.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FHQBase%2Fhqbase-pro-deploy)

Pro supports two first-class lifecycles:

- Fresh installation into empty Cloudflare resources.
- Upgrade from an explicitly supported HQBase Community schema.

It includes the Pro web application, multi-domain mail identities, private durable drafts, a rich
attachment-aware composer, migrations, app-password management, persistent IMAP identity, bridge
API, and staging E2E orchestration. The Fly-hosted `hqbase-mail-bridge` connects through
authenticated HTTPS and never receives Cloudflare credentials.

Pro also exposes an OAuth-protected remote MCP server at `/mcp`. Its baseline read, organize, send,
and reply tools can never exceed the connected user's live mailbox grants. See `docs/mcp.md`.

The basic production launch is a web-first beta. IMAP/SMTP and app-password setup remain a private
preview backed by dedicated preview bridge deployments; they are not generally available or part
of the launch purchase promise. See `docs/mail-bridge.md`.

## Deploy

HQBase Pro supports both lifecycles with distinct safe entry points:

- **Fresh Pro:** create a new D1 database and R2 bucket.
- **Upgrade Community:** start from Settings in the existing Community workspace. HQBase binds the
  purchase to that installation, automatically verifies its Worker and bindings, records a D1 Time
  Travel bookmark, exports SQL into its existing R2 bucket, validates a signed Pro candidate, and
  promotes the same Worker service in place.

After promotion, the same workspace origin exposes Pro settings immediately. Existing domains,
routes, D1 and R2 resources, authentication secret, users, sessions, and mail remain attached.

## Local development

```sh
pnpm install
cp .env.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

Open `http://localhost:8787/setup`.

For presentation-only onboarding work, run the deterministic UI gallery without a purchase,
Cloudflare authorization, or local database:

```sh
pnpm dev:setup-ui
```

Open `http://127.0.0.1:5173/__ui/setup`. Use the state control to inspect every setup step, loading,
validation, failure, submission, and completion. Add `controls=0` to capture the clean canvas. The
gallery is development-only and the production build fails if its markers reach `dist`.

## Quality gate

```sh
pnpm check
pnpm deploy:dry-run
```

## Operator-only recovery check

```sh
pnpm hqbase-pro upgrade --from-community --database <d1-name-or-id> --remote --dry-run
```

This private-source command is for HQBase operators testing or recovering data. Customers never run
it or select a D1 database during an upgrade. The supported customer path starts in the existing
Community workspace and discovers its bindings automatically. Only documented Community schema
versions are accepted; unknown schemas fail before mutation. See `docs/community-upgrade.md` for
the current cutover boundary and `docs/mail-bridge.md` for bridge preview limits.

## Production operations

- `docs/access-control.md`: mailbox grant matrix and enforcement boundary.
- `docs/mcp.md`: MCP connection, scopes, tools, and grant enforcement.
- `docs/operations.md`: doctor, backup, restore, queues, retention, and incident order.
- `docs/updates.md`: signed releases, licensed downloads, notification, and recovery.
- [Public Pro release history](https://github.com/HQBase/hqbase-pro-deploy/blob/main/RELEASE_NOTES.md):
  version-specific changes without exposing private product source.

Pushes to `main` run the full quality gate and automatically start Pro's deployed staging E2E.
Signed publication remains an explicit tag or workflow-dispatch decision; packaging, signing, and
artifact upload are automated after that trigger.

## License

Source-available under the HQBase Commercial Source License 1.0. See `LICENSE.md`, `LICENSING.md`,
and `PROVENANCE.md`.
