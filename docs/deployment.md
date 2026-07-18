# Deployment

HQBase is designed for self-hosting in the deployer's Cloudflare account with one or more
Cloudflare-managed email domains.

## Customer deployment source

Fresh Pro deployments start only from the public, product-code-free
[`HQBase/hqbase-pro-deploy`](https://github.com/HQBase/hqbase-pro-deploy) bootstrap linked by the
README's Deploy to Cloudflare button. Cloudflare clones that repository into the customer's source
control account and connects it to Workers Builds. The private `HQBase/hqbase-pro` repository is
the product source and is not a deployment template.

The bootstrap first deploys a small installer. After the customer enters a Pro license and approves
the Cloudflare OAuth flow, the customer-owned Worker stores the license as a masked build variable,
generates the runtime secrets as masked Worker secrets, downloads the licensed signed Pro artifact,
and deploys it through the connected build. Customers do not copy product source or paste a
Cloudflare API token into HQBase.

Community upgrades start inside the authenticated existing workspace. The Community Worker
discovers and verifies its own D1 and R2 bindings, backs them up, and uploads a signed Pro candidate
as a new version of the same Worker service. It disables Cloudflare Preview URLs, keeps Community
at 100 percent while Pro is staged at zero percent for exact-version smoke validation, and removes
the storage-free validator Worker after promotion. The public bootstrap is not deployed for this
path.

The default `wrangler.jsonc` does not set `BETTER_AUTH_URL`; the Worker derives the deployed request origin. Only set `BETTER_AUTH_URL` explicitly when you need to pin auth to a specific custom origin.

Every email domain must use Cloudflare authoritative DNS. Add missing domains to Cloudflare,
review imported DNS records, update nameservers at the registrar, and wait until each selected
zone is Active before completing `/setup`.

### Cloudflare deploy form guidance

The form exposes only customer-owned resource names. HQBase OAuth identifiers and callbacks,
Billing and release endpoints, and the release verification key are compiled public product
constants. The selected Worker name and licensed release version are injected by the customer-owned
build after the form.

- Git repository: let Cloudflare create the customer-owned copy of `HQBase/hqbase-pro-deploy`.
  Make the generated repository private when the source-control provider offers that choice.
- Project name: keep `hqbase-pro`, or choose another unique Worker/project name.
- Fresh Pro D1: choose Create new. Keep `hqbase-pro`, or rename it for the target environment.
- D1 location hint: leave Automatic unless the deployer has a specific data-location requirement.
- D1 read replication: leave disabled for the MVP.
- Fresh Pro R2: choose Create new. Keep `hqbase-pro-mail`, or rename it.
- R2 location hint: leave blank/automatic unless the deployer has a specific data-location requirement.
- Queues: create new `hqbase-pro-jobs` and `hqbase-pro-jobs-dlq` queues for fresh installs.
  In-place upgrades create or reuse installation-owned queue names automatically.
- Secrets: do not add `BETTER_AUTH_SECRET`, app-password, bridge, session, entitlement, license, or
  setup-token values in the deploy form. The installer generates or stores them as masked values
  after OAuth. Pro derives the request origin, so the form does not expose `BETTER_AUTH_URL`.
- Build/deploy command: keep the public bootstrap repository's `pnpm run deploy` command. It has no
  standalone `pnpm run build` script. The first run deploys the installer; the licensed build
  verifies the signed artifact, applies migrations, deploys Pro, and prints the setup link.

## Private-source operator deployment

The commands below are for HQBase operators working in the private `hqbase-pro` repository. They
are not the supported customer installation path and require direct access to the Pro source.

```sh
pnpm install --ignore-scripts
pnpm build
wrangler d1 create hqbase-pro
wrangler r2 bucket create hqbase-pro-mail
wrangler queues create hqbase-pro-jobs
wrangler queues create hqbase-pro-jobs-dlq
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put PRO_APP_PASSWORD_PEPPER
wrangler secret put PRO_BRIDGE_TOKEN
wrangler secret put PRO_SESSION_SECRET
wrangler secret put PRO_ENTITLEMENT_SECRET
pnpm deploy:dry-run
pnpm deploy
```

Before the dry run, update `wrangler.jsonc` with:

- the D1 `database_id` returned by Cloudflare.
- the R2 bucket name if you did not use `hqbase-pro-mail`;
- both lifecycle queue names if you changed them.

Leave `BETTER_AUTH_URL` unset unless the deployment uses a known custom origin.

## Repeatable Operator Deployment

For repeated development installs and teardowns, use named operator deployments:

```sh
pnpm hqbase-pro:install --name dev-01
pnpm hqbase-pro:doctor --name dev-01
pnpm hqbase-pro:reset --name dev-01 --scope data
pnpm hqbase-pro:destroy --name dev-01 --scope state --yes
pnpm hqbase-pro:destroy --name dev-01 --scope all --yes
```

`destroy --scope state` removes D1, R2, and both lifecycle queues while keeping the Worker and
custom domain. Staging E2E uses this scope so its data plane is disposable without repeatedly
removing and recreating the stable HTTPS endpoint. Use `--scope all` only when retiring the
entire deployment.

For a Community upgrade, every destroy scope preserves the reused Community D1 database and R2
bucket. The manifest's explicit `d1.reused` and `r2.reused` ownership flags are authoritative;
resource names are not. Destruction stops before changing Cloudflare when those flags or the
supported manifest version are missing or ambiguous. Repair or migrate the manifest from verified
deployment records before retrying rather than guessing ownership.

Add `--domain example.com` to `hqbase-pro:install` to enable Cloudflare Email Routing/Sending and point the catch-all route at the deployed Worker. The domain must already be active on Cloudflare DNS.

Use `--app-domain mail.example.com --service-domain hqbase-api.example.com` to attach a mutable
human-facing portal and a separate stable origin for the bridge and automation.

Vendor staging that shares the billing Worker's Cloudflare account should add
`--billing-service hqbase-billing`. Customer deployments use `https://billing.hqbase.io` and do
not need this same-account service binding.

The operator writes `.hqbase-pro/deployments/<name>/manifest.json` and a generated Wrangler config. The manifest is intentionally ignored by Git because it can contain deployment-specific resource names and secret file paths.

## Required Bindings

- `DB`: Cloudflare D1 database.
- `MAIL_OBJECTS`: Cloudflare R2 bucket.
- `MAIL_SENDER`: Cloudflare Email Sending binding.
- `PRO_JOBS`: primary lifecycle queue producer and consumer.
- `ASSETS`: Worker Static Assets binding for `dist`.

The dead-letter queue is configured on the `PRO_JOBS` consumer. The public bootstrap also exposes a
`PRO_JOBS_DLQ` producer so the deploy form provisions it explicitly before the licensed release
attaches the consumer.

## Required Runtime Secrets

- `BETTER_AUTH_SECRET`
- `PRO_APP_PASSWORD_PEPPER`
- `PRO_BRIDGE_TOKEN`
- `PRO_SESSION_SECRET`
- `PRO_ENTITLEMENT_SECRET`

The fresh-install bootstrap generates these. In-place upgrades inherit the existing
`BETTER_AUTH_SECRET` and create only missing Pro-specific secrets. Operators deploying private
source directly must create independent random values with Wrangler. Never commit them or pass
them to the Fly bridge; Fly gets only the deployment-scoped bridge token and Pro HTTPS URL.

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
2. Continue with the temporary Cloudflare authorization approved during installation.
3. Select every email domain, choose which domain hosts the portal, and connect them. Setup also
   creates the separate stable service origin.
4. Enter the owner's full sign-in email. Authentication does not have to use an email domain.
5. Create shared mailboxes using any connected domain.

No Cloudflare API token is pasted into Pro. The installer carries the short-lived delegated grant
into setup as a masked Worker secret. HQBase revokes it and deletes the secret after setup.
