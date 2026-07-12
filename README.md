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

## Deploy

The same Cloudflare flow supports both lifecycles:

- **Fresh Pro:** create a new D1 database and R2 bucket.
- **Upgrade Community:** select the existing Community D1 database and mail R2 bucket. Deployment
  records a D1 Time Travel bookmark, exports SQL into the customer's R2 bucket, applies and verifies
  Pro migrations, then deploys Pro without deleting the Community Worker.

After an upgrade deployment, sign in again, activate the Polar license under Settings → Billing,
and cut over domains from the Pro domain wizard. Keep Community until send and receive verification
passes.

## Local development

```sh
pnpm install
cp .env.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

Open `http://localhost:8787/setup`.

## Quality gate

```sh
pnpm check
pnpm deploy:dry-run
```

## Community upgrade

```sh
pnpm hqbase-pro upgrade --from-community --database <d1-name-or-id> --remote --dry-run
```

Only documented Community schema versions are accepted. Unknown schemas fail before mutation.
See `docs/community-upgrade.md` for the current cutover boundary and `docs/mail-bridge.md` for bridge preview limits.

## Production operations

- `docs/access-control.md`: mailbox grant matrix and enforcement boundary.
- `docs/operations.md`: doctor, backup, restore, queues, retention, and incident order.
- `docs/updates.md`: signed releases, licensed downloads, notification, and recovery.

## License

Source-available under the HQBase Commercial Source License 1.0. See `LICENSE.md`, `LICENSING.md`,
and `PROVENANCE.md`.
