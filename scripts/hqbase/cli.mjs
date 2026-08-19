#!/usr/bin/env node

import { optionalBoolean, optionalString, parseArgs } from "./args.mjs";
import { backup } from "./backup.mjs";
import { updateDeployButton } from "./button.mjs";
import { destroy } from "./destroy.mjs";
import { doctor } from "./doctor.mjs";
import { configureDomain } from "./domain.mjs";
import { install } from "./install.mjs";
import { configureOAuth } from "./oauth.mjs";
import { printPostDeploy } from "./postdeploy.mjs";
import { reset } from "./reset.mjs";
import { restore } from "./restore.mjs";

const [command, ...rest] = process.argv.slice(2);
const { flags } = parseArgs(rest);

try {
  switch (command) {
    case "button":
      updateDeployButton(optionalString(flags, "repo-url") ?? process.env.HQBASE_REPO_URL, {
        dryRun: optionalBoolean(flags, "dry-run")
      });
      break;
    case "install":
      install(flags);
      break;
    case "doctor":
      doctor(flags);
      break;
    case "oauth":
      configureOAuth(flags);
      break;
    case "domain":
      await configureDomain(flags);
      break;
    case "backup":
      backup(flags);
      break;
    case "restore":
      restore(flags);
      break;
    case "reset":
      reset(flags);
      break;
    case "destroy":
      destroy(flags);
      break;
    case "postdeploy":
      printPostDeploy();
      break;
    case "help":
    case undefined:
      printHelp();
      break;
    default:
      throw new Error(`Unknown command "${command}".`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function printHelp() {
  console.log(`HQBase operator

Usage:
  pnpm hqbase button --repo-url https://github.com/OWNER/REPO
  pnpm hqbase install --name dev-01 [--domain example.com]
  pnpm hqbase oauth --name dev-01 --mode official|customer
  pnpm hqbase domain --name dev-01 --app-domain app.example.com|--detach
  pnpm hqbase doctor --name dev-01
  pnpm hqbase backup --name dev-01 [--output backup.json]
  pnpm hqbase restore --name dev-01 --backup backup.json --yes
  pnpm hqbase reset --name dev-01 --scope data|storage|domain|all
  pnpm hqbase destroy --name dev-01 --scope worker|data|storage|state|domain|all --yes
  pnpm hqbase postdeploy

Install options:
  --worker-name <name>   Override Worker name. Defaults to hqbase-<name>.
  --d1-name <name>       Override D1 database name. Defaults to hqbase-<name>.
  --r2-bucket <name>     Override R2 bucket name. Defaults to hqbase-<name>-mail.
  --queue-name <name>    Override lifecycle queue name. Defaults to hqbase-<name>-jobs.
  --domain <domain>      Configure Cloudflare Email Routing/Sending for the domain.
  --no-email             Skip Email Routing/Sending changes even when --domain is set.
  --no-sending           Skip Email Sending enablement.
  --app-domain <host>    Attach a custom Worker domain in the generated config.
  --auth-url <origin>    Set BETTER_AUTH_URL explicitly. Usually unnecessary.
  --oauth-mode <mode>    Use official (default) or customer-managed OAuth.
  --oauth-client-id <id> Customer OAuth client ID. Requires --oauth-mode customer and --auth-url.
  HQBASE_AUTH_SECRET     Preserve an existing Better Auth secret without exposing it in argv.
  --auth-secret <value>  Compatibility fallback. Prefer HQBASE_AUTH_SECRET.
  --skip-build           Skip pnpm build.
  --skip-deploy          Create resources/config/migrations without deploying Worker.
  --dry-run              Print commands without mutating Cloudflare.

OAuth options:
  --mode <mode>          Use official or customer-managed OAuth.
  --client-id <id>       Customer OAuth client ID. Required for customer mode.
  --auth-url <origin>    Exact canonical HTTPS HQBase origin. Required for customer mode.
  --skip-deploy          Validate and write local deployment configuration without deploying.
  --dry-run              Validate without writing or deploying.

Domain options (moves the canonical portal host; D1, R2, and queues are untouched):
  --app-domain <host>    Attach this hostname and make it the canonical portal host.
  --detach               Remove every custom domain and serve from workers.dev. Requires --yes.
  --keep-service-origin  Keep the machine-facing service origin on the current hostname.
  --move-service-origin  Move the service origin to the new hostname. Ends every agent token,
                         OAuth redirect URI, and webhook registered on the old origin.
  --auth-url <origin>    Set the service origin explicitly to a canonical HTTPS origin.
  --detach-old           Delete the previous hostname instead of keeping it as a redirect.
                         Requires --yes.
  --override-existing    Take over a hostname that already routes elsewhere. Requires --yes in a
                         non-interactive shell.
  --yes                  Confirm the steps that delete a Cloudflare DNS record or take a hostname.
  --skip-deploy          Attach and verify without deploying configuration.
  --dry-run              Validate without contacting Cloudflare, writing, or deploying.

The domain command reads and writes Worker custom domains through the Cloudflare API and needs
CLOUDFLARE_API_TOKEN with Workers Scripts:Edit, Zone:Read, and DNS:Edit.
`);
}
