# Deployment

HQBase is designed for self-hosting in the deployer's Cloudflare account with a
Cloudflare-managed primary domain.

## Deploy Button

The README includes a Deploy to Cloudflare button. Before publishing, point it at the public repository:

```sh
pnpm hqbase:button --repo-url https://github.com/OWNER/REPO
```

Cloudflare's deploy flow clones the repository, prompts for configured variables, provisions supported resources from `wrangler.jsonc`, and runs the deploy command. That command verifies and deploys the current signed Community stable artifact instead of treating the cloned source as a released Worker. On the first customer-owned build, it generates a unique `BETTER_AUTH_SECRET`, uploads it as a masked Worker secret, and deletes the temporary local file. Later builds preserve the existing value instead of rotating it.

Cloudflare may rewrite `wrangler.jsonc.name` when the installer chooses a custom
project name. `pnpm deploy` treats that configured name as the source of truth
and injects it as `HQBASE_WORKER_NAME` for both source deployments and signed
updates. Setup and update automation must not maintain a second independent
Worker name.

The default `wrangler.jsonc` does not set `BETTER_AUTH_URL`; the Worker derives the deployed request origin. Only set `BETTER_AUTH_URL` explicitly when you need to pin auth to a specific custom origin.

HQBase requires the primary domain to use Cloudflare authoritative DNS. If the
domain is not on Cloudflare yet, add it to Cloudflare, review the imported DNS
records, update nameservers at the registrar, and wait until Cloudflare marks the
domain Active before completing `/setup`.

### Deploy Form Guidance

- Git repository: Cloudflare creates a copy of this public template in the deployer's GitHub/GitLab account. Use a private generated repository for business installs or custom changes.
- Project name: keep `hqbase`, or change it if the account already has a Worker/project with that name.
- D1 database: choose Create new. Keep `hqbase`, or rename it for the target environment.
- D1 location hint: leave Automatic unless the deployer has a specific data-location requirement.
- D1 read replication: leave disabled for the MVP.
- R2 bucket: choose Create new. Keep `hqbase-mail`, or rename it for the target environment.
- R2 location hint: leave blank/automatic unless the deployer has a specific data-location requirement.
- `BETTER_AUTH_URL`: normally leave unset. HQBase derives the request origin at runtime.
- Build command: keep `pnpm run build`.
- Deploy command: keep `pnpm run deploy`; this runs the build, applies D1 migrations by the `DB` binding, deploys the Worker, and prints the setup link.

Normal customer deployments fail closed if the cloned source is newer than the published signed
stable release. Maintainers may set `HQBASE_FORCE_SOURCE_DEPLOY=1` only for an intentionally
unsigned development deployment; such a Worker cannot start an in-place Pro upgrade until it has
applied a signed Community release.

## Manual Deployment

```sh
pnpm install --ignore-scripts
pnpm build
wrangler d1 create hqbase
wrangler r2 bucket create hqbase-mail
wrangler secret put BETTER_AUTH_SECRET
pnpm deploy:dry-run
pnpm deploy
```

Before the dry run, update `wrangler.jsonc` with:

- the D1 `database_id` returned by Cloudflare.
- the R2 bucket name if you did not use `hqbase-mail`.

Leave `BETTER_AUTH_URL` unset unless the deployment uses a known custom origin.

## Repeatable Operator Deployment

For repeated development installs and teardowns, use named operator deployments:

```sh
pnpm hqbase:install --name dev-01
pnpm hqbase:doctor --name dev-01
pnpm hqbase:reset --name dev-01 --scope data
pnpm hqbase:destroy --name dev-01 --scope all --yes
```

Add `--domain example.com` to `hqbase:install` to enable Cloudflare Email Routing/Sending and point the catch-all route at the deployed Worker. The domain must already be active on Cloudflare DNS.

The operator writes `.hqbase/deployments/<name>/manifest.json` and a generated Wrangler config. The manifest is intentionally ignored by Git because it can contain deployment-specific resource names and secret file paths.

## Required Bindings

- `DB`: Cloudflare D1 database.
- `MAIL_OBJECTS`: Cloudflare R2 bucket.
- `MAIL_SENDER`: Cloudflare Email Sending binding.
- `ASSETS`: Worker Static Assets binding for `dist`.

## Required Secret

- `BETTER_AUTH_SECRET`: generated automatically by the first Deploy to Cloudflare build. Manual
  deployments must set it with `wrangler secret put BETTER_AUTH_SECRET` before `pnpm deploy`.

## Deployment Check

Run this before publishing changes:

```sh
pnpm check
pnpm deploy:dry-run
```

The dry run should show these bindings: `DB`, `MAIL_OBJECTS`, `MAIL_SENDER`, and `ASSETS`.

## Setup After Deploy

The deploy command prints the setup link. Use the Worker URL shown by Wrangler,
then add `/setup`.

1. Visit `/setup`.
2. Click `Authorize Cloudflare` and approve the requested setup permissions.
3. Select the primary domain, then click `Connect domain and continue` to run
   the required Cloudflare configuration and readiness checks.
4. Enter the owner's account email. It may use any valid domain because it is
   used for sign-in and recovery, not as a mailbox.
5. Create at least one shared mailbox on the selected workspace domain. Community
   mailboxes are shared with the workspace. The optional owner-named mailbox is
   off by default and is created only when explicitly selected.

HQBase keeps the OAuth grant encrypted in a short-lived HTTP-only cookie, never
stores it in D1 or R2, and revokes it after Cloudflare reports the domain ready.
The advanced manual-token fallback requests the same permissions shown by the
OAuth consent screen.
