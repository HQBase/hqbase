#!/usr/bin/env node

import { optionalBoolean, optionalString, parseArgs } from "./args.mjs";
import { backup } from "./backup.mjs";
import { updateDeployButton } from "./button.mjs";
import { destroy } from "./destroy.mjs";
import { doctor } from "./doctor.mjs";
import { install } from "./install.mjs";
import { printPostDeploy } from "./postdeploy.mjs";
import { reset } from "./reset.mjs";
import { restore } from "./restore.mjs";
import { runUpgrade, validateUpgradeOptions } from "./upgrade.mjs";

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
    case "upgrade":
      runUpgrade(validateUpgradeOptions(flags));
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
  pnpm hqbase-pro button --repo-url https://github.com/OWNER/REPO
  pnpm hqbase-pro install --name dev-01 [--domain example.com]
  pnpm hqbase-pro doctor --name dev-01
  pnpm hqbase-pro backup --name dev-01 [--output backup.json]
  pnpm hqbase-pro restore --name dev-01 --backup backup.json --yes
  pnpm hqbase-pro reset --name dev-01 --scope data|storage|domain|all
  pnpm hqbase-pro destroy --name dev-01 --scope worker|data|storage|state|domain|all --yes
  pnpm hqbase-pro postdeploy
  pnpm hqbase-pro upgrade --from-community --database <name> --local --dry-run
  pnpm hqbase-pro upgrade --from-community --database <name> --remote --dry-run

Install options:
  --worker-name <name>   Override Worker name. Defaults to hqbase-pro-<name>.
  --d1-name <name>       Override D1 database name. Defaults to hqbase-pro-<name>.
  --r2-bucket <name>     Override R2 bucket name. Defaults to hqbase-pro-<name>-mail.
  --reuse-d1-id <uuid>   Deploy over an existing Community D1 database.
  --reuse-r2-bucket <name>  Deploy over an existing Community mail bucket.
  --queue-name <name>    Override lifecycle queue name. Defaults to hqbase-pro-<name>-jobs.
  --domain <domain>      Configure Cloudflare Email Routing/Sending for the domain.
  --no-email             Skip Email Routing/Sending changes even when --domain is set.
  --no-sending           Skip Email Sending enablement.
  --app-domain <host>    Attach a custom Worker domain in the generated config.
  --service-domain <host> Attach a stable bridge/API domain in the generated config.
  --auth-url <origin>    Set BETTER_AUTH_URL explicitly. Usually unnecessary.
  --billing-service <worker>  Use a same-account billing Worker service binding (staging only).
  HQBASE_AUTH_SECRET     Preserve an existing Better Auth secret without exposing it in argv.
  --auth-secret <value>  Compatibility fallback. Prefer HQBASE_AUTH_SECRET.
  --app-password-pepper <value>  Override the generated app-password pepper.
  --bridge-token <value>         Set the deployment token shared with the bridge.
  --session-secret <value>       Override the generated mail-session secret.
  --skip-build           Skip pnpm build.
  --skip-deploy          Create resources/config/migrations without deploying Worker.
  --dry-run              Print commands without mutating Cloudflare.

Upgrade options:
  --from-community       Require and verify a Community database before changes.
  --database <name>      D1 database name or UUID.
  --local | --remote     Select exactly one target.
  --backup <path>        Override the automatic remote backup path.
  --yes                  Confirm a remote migration after its dry run.
`);
}
