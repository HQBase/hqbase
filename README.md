# HQBase

HQBase is a self-hosted shared email workspace for one Cloudflare account and one Cloudflare-managed primary domain. The MVP is email only: users, shared mailboxes, inbound mail through Cloudflare Email Routing / Email Service, outbound mail through Cloudflare Email Service, D1 metadata, and R2 raw mail/attachments.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FHQBase%2Fhqbase)

## MVP Scope

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

Pushes to `main` run the full quality gate and automatically start deployed Community staging E2E.
Signed publication remains an explicit tag or workflow-dispatch decision; packaging, signing, and
artifact upload are automated after that trigger.

## Deployment

The Deploy to Cloudflare button is the public install path. Before publishing this repo, point the button at the public GitHub or GitLab URL:

```sh
pnpm hqbase:button --repo-url https://github.com/OWNER/REPO
```

Cloudflare clones the repository, provisions configured Worker resources, and deploys the verified signed Community stable artifact into the installer's account. The first customer-owned build generates and stores a unique masked Better Auth secret automatically; later builds preserve it. After deployment, visit `/setup`.

HQBase requires a domain with authoritative DNS managed by Cloudflare. In `/setup`, click `Authorize Cloudflare`, approve the listed permissions, and select the primary domain. `Connect domain and continue` enables Email Routing DNS, points catch-all mail at the Worker, enables Email Sending, and advances only after Cloudflare reports the domain ready. The short-lived OAuth grant stays encrypted in an HTTP-only cookie and is revoked when domain setup succeeds; it is never stored in D1 or R2. The owner account email may use any valid domain because it is only the sign-in and recovery identity. Shared mailboxes always use the selected workspace domain; setup does not create one from the account email unless you explicitly opt in.

Manual API-token entry remains available under `Use an API token instead` for forks and accounts that cannot use the public OAuth client.

If your domain is not on Cloudflare yet, first add it to Cloudflare and update nameservers. After Cloudflare marks the zone Active, return to `/setup` and authorize Cloudflare again to refresh the domain list.

Suggested Deploy to Cloudflare form choices:

- Git repository: choose private if this is a business install or you plan to customize the generated clone. The original HQBase source repo must remain public for the button to work.
- Project name: keep `hqbase`, or change it if you already have a Worker/project with that name.
- D1 database: create new. Rename from `hqbase` only if it conflicts or you want an environment-specific name.
- R2 bucket: create new. Rename from `hqbase-mail` only if it conflicts or you want an environment-specific name.
- Build command: keep `pnpm run build`.
- Deploy command: keep `pnpm run deploy`; it prints the setup link after Wrangler deploys the Worker.

`BETTER_AUTH_URL` is normally not needed. HQBase derives the auth origin from the deployed request URL. Only set it manually if you intentionally pin auth to a specific custom origin.

For repeatable development installs in your own Cloudflare account, use the HQBase operator:

```sh
pnpm hqbase:install --name dev-01
pnpm hqbase:doctor --name dev-01
pnpm hqbase:reset --name dev-01 --scope data
pnpm hqbase:destroy --name dev-01 --scope all --yes
```

Use `--domain example.com` with `hqbase:install` to also configure Cloudflare Email Routing/Sending for that Cloudflare-managed domain.

Cloudflare email routing and DNS steps can be handled by either the repeatable operator or the in-app setup wizard. See [docs/cloudflare-email-setup.md](docs/cloudflare-email-setup.md).

Agent and operator details live in [AGENTS.md](AGENTS.md).

## License and Open Core

HQBase OSS is licensed under AGPL-3.0-or-later. The open-source core is intended to stay a complete, useful shared inbox for self-hosting in a Cloudflare account.

Future commercial offerings may add advanced team operations features, such as per-mailbox permissions, private inboxes, assignments, internal notes, audit logs, compliance exports, advanced automations, and supported onboarding. The intended boundary is documented in [docs/open-core-boundary.md](docs/open-core-boundary.md).

The HQBase name and branding are not licensed under AGPL. See [TRADEMARKS.md](TRADEMARKS.md).

## Screenshots

Screenshots will be added after the first live deployment.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Keep changes small, typed, tested, and Cloudflare-native.
