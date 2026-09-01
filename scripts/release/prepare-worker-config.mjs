#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mailEventsBinding = { name: "MAIL_EVENTS", class_name: "MailEvents" };
const mailEventsMigration = { tag: "mail-events-v1", new_sqlite_classes: ["MailEvents"] };

export function prepareRequiredWorkerConfig(config) {
  assertObject(config, "Worker configuration");
  const durableBindings = array(config.durable_objects?.bindings);
  const currentBinding = durableBindings.find(
    (binding) => binding?.name === mailEventsBinding.name
  );
  if (currentBinding && currentBinding.class_name !== mailEventsBinding.class_name) {
    throw new Error("MAIL_EVENTS must bind the MailEvents Durable Object class.");
  }

  const migrations = array(config.migrations);
  const currentMigration = migrations.find(
    (migration) => migration?.tag === mailEventsMigration.tag
  );
  if (
    currentMigration &&
    !array(currentMigration.new_sqlite_classes).includes(mailEventsBinding.class_name)
  ) {
    throw new Error("mail-events-v1 must create the MailEvents SQLite Durable Object class.");
  }
  const conflictingMigration = migrations.find(
    (migration) =>
      migration?.tag !== mailEventsMigration.tag &&
      array(migration?.new_sqlite_classes).includes(mailEventsBinding.class_name)
  );
  if (conflictingMigration) {
    throw new Error("MailEvents is assigned to an unexpected Durable Object migration tag.");
  }

  const prepared = {
    ...config,
    durable_objects: {
      ...config.durable_objects,
      bindings: currentBinding ? durableBindings : [...durableBindings, mailEventsBinding]
    },
    migrations: currentMigration ? migrations : [...migrations, mailEventsMigration]
  };
  assertRequiredWorkerConfig(prepared);
  return prepared;
}

export function assertRequiredWorkerConfig(config) {
  const checks = [
    [config.assets?.binding === "ASSETS", "ASSETS Worker Assets binding"],
    [array(config.d1_databases).some((binding) => binding?.binding === "DB"), "DB D1 binding"],
    [
      array(config.r2_buckets).some((binding) => binding?.binding === "MAIL_OBJECTS"),
      "MAIL_OBJECTS R2 binding"
    ],
    [
      array(config.queues?.producers).some((binding) => binding?.binding === "HQBASE_JOBS"),
      "HQBASE_JOBS Queue binding"
    ],
    [
      array(config.send_email).some((binding) => binding?.name === "MAIL_SENDER"),
      "MAIL_SENDER Email binding"
    ],
    [
      array(config.durable_objects?.bindings).some(
        (binding) =>
          binding?.name === mailEventsBinding.name &&
          binding?.class_name === mailEventsBinding.class_name
      ),
      "MAIL_EVENTS Durable Object binding"
    ],
    [
      array(config.migrations).some(
        (migration) =>
          migration?.tag === mailEventsMigration.tag &&
          array(migration?.new_sqlite_classes).includes(mailEventsBinding.class_name)
      ),
      "mail-events-v1 Durable Object migration"
    ]
  ];
  const missing = checks.filter(([present]) => !present).map(([, label]) => label);
  if (missing.length > 0) {
    throw new Error(`HQBase Worker configuration is missing: ${missing.join(", ")}.`);
  }
}

export function prepareRequiredWorkerConfigFile(configFile) {
  const source = readFileSync(configFile, "utf8");
  const config = JSON.parse(source);
  const prepared = prepareRequiredWorkerConfig(config);
  if (JSON.stringify(prepared) !== JSON.stringify(config)) {
    writeFileSync(configFile, `${JSON.stringify(prepared, null, 2)}\n`);
  }
  return prepared;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  prepareRequiredWorkerConfigFile(resolve(process.cwd(), "wrangler.jsonc"));
  console.log("HQBase Worker bindings and migrations are ready.");
}
