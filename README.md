<p align="center">
  <a href="https://hqbase.io/">
    <img src="public/logo.svg" alt="HQBase" width="118">
  </a>
</p>

<h1 align="center">HQBase</h1>

<p align="center">
  <strong>Your team's email workspace. On your infrastructure.</strong>
</p>

<p align="center">
  An open-source shared email workspace that runs in your Cloudflare account and keeps mail and
  credentials in infrastructure you control.
</p>

<p align="center">
  <a href="https://hqbase.io/">Website</a> &middot;
  <a href="https://hqbase.io/docs/">Documentation</a> &middot;
  <a href="https://github.com/HQBase/hqbase/releases">Releases</a> &middot;
  <a href="https://hqbase.io/docs/maintainers/contributing/">Contributing</a> &middot;
  <a href="https://x.com/berman_to">X</a>
</p>

<p align="center">
  <a href="https://github.com/HQBase/hqbase/actions/workflows/ci.yml">
    <img src="https://github.com/HQBase/hqbase/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status">
  </a>
  <a href="https://github.com/HQBase/hqbase/releases/latest">
    <img src="https://img.shields.io/github/v/release/HQBase/hqbase?display_name=tag&amp;sort=semver" alt="Latest release">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/HQBase/hqbase" alt="AGPL-3.0-only license">
  </a>
  <a href="https://discord.gg/U67PB663nf">
    <img src="https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?logo=discord&amp;logoColor=white" alt="Join the HQBase Discord">
  </a>
</p>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FHQBase%2Fhqbase%2Ftree%2Fdeploy">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare">
  </a>
</p>

## About HQBase

<p align="center">
  <img src="public/hqbase-desktop-screenshot.png" alt="HQBase shared inbox interface">
</p>

HQBase gives teams one place to work with shared mailboxes while keeping the application, mail,
and Cloudflare credentials in customer infrastructure. It includes:

- Shared mailboxes and team access controls.
- Multi-domain setup, drafts, and audit history.
- Installation, update, backup, and recovery operations.
- An OAuth-protected remote MCP server.

See the [product documentation](https://hqbase.io/docs/) for installation, daily use, architecture,
and operations.

## Made by the community

We love seeing people build around HQBase. Independent clients give you more ways to use your
workspace:

- [Herald](https://github.com/awizemann/herald) — A native macOS email client for HQBase.

HQBase has tested Herald for compatibility. It is made and maintained by independent community
developers, so its releases, support, and behavior remain in their care rather than HQBase's.
Please review the project and decide whether it is right for your workspace.

## Develop locally

### Start the application

```sh
pnpm install
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

Before you run the optional seed command, add these values to `.dev.vars`:

- `BETTER_AUTH_SECRET`
- `HQBASE_LOCAL_SEED_PASSWORD` with 8 to 128 characters

The seed command writes only to local D1 and does not contact Cloudflare OAuth. Open
`http://127.0.0.1:5173/` and sign in as `owner@hqbase.test` with that
password. Vite serves the frontend with live reload on port 5173 and proxies API requests to the
Wrangler Worker on port 8787.

To use the first-run setup flow, omit the seed command and open `http://localhost:5173/setup`.

### Reset local data

To discard all local D1 data, rebuild the schema, and recreate the demo workspace:

```sh
pnpm db:reset:local
pnpm db:seed:local
```

The reset command is destructive and local only. It does not change a deployed database.

### Preview the setup interface

For presentation-only onboarding work:

```sh
pnpm dev:setup-ui
```

Open `http://127.0.0.1:5173/__ui/setup`.

### Review the visual system

To inspect the shared components, interactive states, product patterns, and local screen routes:

```sh
pnpm dev:ui
```

Open `http://127.0.0.1:5173/__ui/design`. The gallery uses deterministic presentation fixtures
and does not call product APIs.

## Verify changes

Run the full local quality gate:

```sh
pnpm check
pnpm deploy:dry-run
```

Run `pnpm cf:typegen` after you change `wrangler.jsonc`.

Pushes to `main` run the same quality gate and deployment dry-run. Deployed staging is manual and
also runs inside the signed release workflow. A release stays in draft until the previous stable
version upgrades to the exact signed candidate and passes its checks. Customer installations and
updates verify the signed manifest and artifact digest before deployment.

## Documentation

[hqbase.io/docs](https://hqbase.io/docs/) is the public source for user and operator guides,
product specifications, and maintainer procedures.

## Contributing

Read the [contribution guide](CONTRIBUTING.md) before you open a pull request.

## Security

To report a vulnerability, follow the private process in the [security policy](SECURITY.md).

## License

HQBase is available under the [GNU Affero General Public License v3.0 only](LICENSE).
