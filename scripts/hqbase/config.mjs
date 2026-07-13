import fs from "node:fs";

import { configPath } from "./manifest.mjs";
import { rootDir } from "./paths.mjs";

const rootFromDeployment = "../../..";
const appVersion = JSON.parse(fs.readFileSync(`${rootDir}/package.json`, "utf8")).version;
const releasePublicKey = "MCowBQYDK2VwAyEAsVwKniCvpHDwbbnjTPP0SuIIG97cRL+iFBQvay9OrU4=";

export function writeWranglerConfig(manifest, options = {}) {
  if (options.dryRun) {
    return;
  }

  const config = {
    $schema: `${rootFromDeployment}/node_modules/wrangler/config-schema.json`,
    name: manifest.worker.name,
    main: `${rootFromDeployment}/worker/index.ts`,
    compatibility_date: "2026-06-28",
    compatibility_flags: ["nodejs_compat"],
    assets: {
      directory: `${rootFromDeployment}/dist`,
      binding: "ASSETS",
      not_found_handling: "single-page-application"
    },
    observability: {
      enabled: true,
      head_sampling_rate: 1
    },
    secrets: {
      required: ["BETTER_AUTH_SECRET"]
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: manifest.d1.name,
        database_id: manifest.d1.id,
        migrations_dir: `${rootFromDeployment}/migrations`
      }
    ],
    r2_buckets: [
      {
        binding: "MAIL_OBJECTS",
        bucket_name: manifest.r2.bucket
      }
    ],
    send_email: [
      {
        name: "MAIL_SENDER"
      }
    ],
    vars: {
      HQBASE_APP_VERSION: appVersion,
      HQBASE_RELEASE_PUBLIC_KEY: releasePublicKey,
      HQBASE_RELEASES_URL: "https://billing.hqbase.io/v1/releases",
      HQBASE_WORKER_NAME: manifest.worker.name
    }
  };

  if (manifest.authUrl) {
    config.vars.BETTER_AUTH_URL = manifest.authUrl;
  }
  if (manifest.appDomain) {
    config.routes = [{ pattern: manifest.appDomain, custom_domain: true }];
  }

  fs.writeFileSync(configPath(manifest.name), `${JSON.stringify(config, null, 2)}\n`);
}
