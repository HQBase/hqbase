# HQBase Pro

Source-available repository for the complete HQBase Pro product.

Pro supports two first-class lifecycles:

- Fresh installation into empty Cloudflare resources.
- Upgrade from an explicitly supported HQBase Community schema.

It includes the Pro web application, Worker, migrations, app-password management, persistent IMAP identity, bridge API, and staging E2E orchestration. The Fly-hosted `hqbase-mail-bridge` connects through authenticated HTTPS and never receives Cloudflare credentials.

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

## License

Source-available under PolyForm Noncommercial 1.0.0. Commercial use requires a separate written license. See `LICENSE.md`, `LICENSING.md`, and `PROVENANCE.md`.
