import fs from "node:fs";

import { configPath } from "./manifest.mjs";

const rootFromDeployment = "../../..";

export function writeWranglerConfig(manifest, options = {}) {
  if (options.dryRun) {
    return;
  }

  const config = {
    $schema: `${rootFromDeployment}/node_modules/wrangler/config-schema.json`,
    name: manifest.worker.name,
    main: `${rootFromDeployment}/worker/index.ts`,
    compatibility_date: "2026-07-11",
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
    queues: {
      producers: [{ binding: "PRO_JOBS", queue: manifest.queue.name }],
      consumers: [
        {
          queue: manifest.queue.name,
          dead_letter_queue: manifest.queue.deadLetterName,
          max_batch_size: 10,
          max_batch_timeout: 5,
          max_retries: 3
        }
      ]
    },
    triggers: { crons: ["17 3 * * *"] },
    send_email: [
      {
        name: "MAIL_SENDER"
      }
    ]
  };

  if (manifest.authUrl) {
    config.vars = { BETTER_AUTH_URL: manifest.authUrl };
  }
  if (manifest.appDomain) {
    config.routes = [{ pattern: manifest.appDomain, custom_domain: true }];
  }

  fs.writeFileSync(configPath(manifest.name), `${JSON.stringify(config, null, 2)}\n`);
}
