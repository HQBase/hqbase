# HQBase

HQBase Community is a complete self-hosted shared email workspace for one Cloudflare account and
one Cloudflare-managed primary domain. It provides users, shared mailboxes, inbound and outbound
mail, D1 metadata, and R2 mail and attachment storage.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FHQBase%2Fhqbase)

## Community product

- Multiple HQBase users in one workspace.
- Multiple shared domain mailboxes like `hello@example.com` and `support@example.com`.
- All users can view all mailboxes and send from active mailboxes.
- Owner/admin users can manage users and mailboxes.
- No IMAP, calendar, billing, multi-tenant SaaS, mailbox ACLs, or external email providers.

## Architecture

- Runtime: Cloudflare Workers module syntax.
- Frontend: Vite, React, TypeScript, Tailwind CSS, shadcn-style components.
- API router: Hono under `/api/*`.
- Auth: Better Auth email/password with D1-backed tables.
- Database: Cloudflare D1 for settings, users, mailboxes, message metadata, threads, and attachments metadata.
- Object storage: Cloudflare R2 for raw `.eml`, HTML bodies, and attachments.
- Email: Worker `email()` handler for inbound and `send_email` binding for outbound.

## Local Development

```sh
pnpm install
printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" > .dev.vars
pnpm db:migrate:local
pnpm dev
```

Useful commands:

```sh
pnpm dev:vite
pnpm build
pnpm deploy
pnpm db:migrate:local
pnpm db:migrate:remote
pnpm test
pnpm test:coverage
pnpm check
pnpm deploy:dry-run
pnpm hqbase help
```

Open the local app at `http://localhost:8787/setup`.

## Updates

Owners and admins are notified in the normal application shell when a newer signed stable release
is available. Settings -> Updates shows the version, compatibility, release notes, checkpoint
boundary, and guarded Workers Builds action. The temporary Cloudflare API token used to start an
update is never stored. See [docs/updates.md](docs/updates.md).

Version-specific changes are recorded in [CHANGELOG.md](CHANGELOG.md).

Pushes to `main` run the full quality gate and automatically start deployed Community staging E2E.
Signed publication remains an explicit tag or workflow-dispatch decision; packaging, signing, and
artifact upload are automated after that trigger.

## Deployment

The Deploy to Cloudflare button is the public install path. Cloudflare creates the customer-owned
Worker resources and deploys the verified signed Community release. The first build generates a
masked authentication secret; later builds preserve it.

HQBase requires a domain with authoritative DNS managed by Cloudflare. In `/setup`, click `Authorize Cloudflare`, approve the listed permissions, and select the primary domain. `Connect domain and continue` enables Email Routing DNS, points catch-all mail at the Worker, enables Email Sending, and advances only after Cloudflare reports the domain ready. The short-lived OAuth grant stays encrypted in an HTTP-only cookie and is revoked when domain setup succeeds; it is never stored in D1 or R2. The owner account email may use any valid domain because it is only the sign-in and recovery identity. Shared mailboxes always use the selected workspace domain; setup does not create one from the account email unless you explicitly opt in.

Manual API-token entry remains available under `Use an API token instead` for forks and accounts that cannot use the public OAuth client.

If your domain is not on Cloudflare yet, add it and update nameservers before returning to setup.
See [deployment](docs/deployment.md) for form, manual, and operator instructions and
[Cloudflare email setup](docs/cloudflare-email-setup.md) for domain and mail prerequisites.

For repeatable development installs in your own Cloudflare account, use the HQBase operator:

```sh
pnpm hqbase:install --name dev-01
pnpm hqbase:doctor --name dev-01
pnpm hqbase:reset --name dev-01 --scope data
pnpm hqbase:destroy --name dev-01 --scope all --yes
```

Use `--domain example.com` with `hqbase:install` to also configure Cloudflare Email Routing/Sending for that Cloudflare-managed domain.

Agent and operator details live in [AGENTS.md](AGENTS.md).

## License and product boundary

Community is licensed under AGPL-3.0-or-later. HQBase Pro is a separate complete product with its
own source license and repository. The current boundary is documented in
[docs/product-boundary.md](docs/product-boundary.md).

The HQBase name and branding are not licensed under AGPL. See [TRADEMARKS.md](TRADEMARKS.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Keep changes small, typed, tested, and Cloudflare-native.
