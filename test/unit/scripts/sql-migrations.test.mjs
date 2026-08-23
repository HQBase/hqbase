import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { afterEach, describe, expect, it } from "vitest";

const migrationsDirectory = resolve(import.meta.dirname, "../../../migrations");
const afterDeployMigrationsDirectory = resolve(
  import.meta.dirname,
  "../../../migrations-after-deploy"
);
const resetSql = readFileSync(
  resolve(import.meta.dirname, "../../../scripts/hqbase/reset-d1.sql"),
  "utf8"
);
const expectedMigrationNames = [
  "0001_initial.sql",
  "0002_workspace.sql",
  "0003_oauth_resources.sql",
  "0004_conversations.sql",
  "0005_rebuild_threads.sql",
  "0006_push_notifications.sql",
  "0007_user_mail_preferences.sql",
  "0008_user_onboarding.sql",
  "0009_login_email_domain_isolation.sql",
  "0010_oauth_device_authorization.sql",
  "0011_latest_password_reset_token.sql",
  "0012_message_activity_index.sql",
  "0013_message_changes.sql",
  "0014_unassigned_messages.sql",
  "0015_draft_changes.sql",
  "0016_one_address_per_mailbox.sql"
];
const expectedAfterDeployMigrationNames = ["0001_remove_mailbox_alias_storage.sql"];
const oneAddressMigrationSource = readFileSync(
  resolve(migrationsDirectory, "0016_one_address_per_mailbox.sql"),
  "utf8"
);
const aliasCleanupMigrationSource = readFileSync(
  resolve(afterDeployMigrationsDirectory, "0001_remove_mailbox_alias_storage.sql"),
  "utf8"
);
const databases = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE d1_migrations_after_deploy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  databases.push(database);
  return database;
}

function applyMigration(database, migration, table = "d1_migrations") {
  if (!new Set(["d1_migrations", "d1_migrations_after_deploy"]).has(table)) {
    throw new Error(`Unexpected migration table: ${table}`);
  }
  const applied = database.prepare(`SELECT 1 FROM ${table} WHERE name = ?`).get(migration.name);
  if (applied) return false;

  database.exec("BEGIN");
  try {
    for (const query of migration.queries) database.exec(query);
    database.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(migration.name);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return true;
}

function insertRepresentativeData(database) {
  const timestamp = "2026-08-20T12:00:00.000Z";
  database
    .prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('usr_upgrade', 'Upgrade', 'upgrade@login.example', 1, ?, ?)`
    )
    .run(timestamp, timestamp);
  database
    .prepare(
      `INSERT INTO account
         (id, issuer, providerAccountId, providerId, userId, createdAt, updatedAt)
       VALUES ('acc_upgrade', 'credential', 'usr_upgrade', 'credential', 'usr_upgrade', ?, ?)`
    )
    .run(timestamp, timestamp);
  database
    .prepare(
      `INSERT INTO mailboxes (id, address, display_name, created_at, updated_at)
       VALUES ('mbx_upgrade', 'mailbox@example.com', 'Mailbox', ?, ?)`
    )
    .run(timestamp, timestamp);
  database
    .prepare(
      `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, created_at, updated_at)
       VALUES ('dom_upgrade', 'example.com', 'ready', 'ready', 'ready', ?, ?)`
    )
    .run(timestamp, timestamp);
  database
    .prepare(
      `INSERT INTO mailbox_addresses
         (id, mailbox_id, mail_domain_id, local_part, address, display_name,
          receive_enabled, send_enabled, is_primary, created_at, updated_at)
       VALUES ('addr_upgrade', 'mbx_upgrade', 'dom_upgrade', 'mailbox',
               'mailbox@example.com', 'Mailbox', 1, 1, 1, ?, ?)`
    )
    .run(timestamp, timestamp);
  database
    .prepare(
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES ('thr_upgrade', 'upgrade', ?, ?, ?)`
    )
    .run(timestamp, timestamp, timestamp);
  const insertMessage = database.prepare(
    `INSERT INTO messages
       (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json,
        bcc_json, subject, snippet, text_body, references_json, delivered_to_address_id,
        created_at, updated_at)
     VALUES (?, 'thr_upgrade', ?, 'inbound', ?, 'sender@example.com',
       '["mailbox@example.com"]', '[]', '[]', ?, 'Upgrade message', 'Upgrade message',
       '[]', ?, ?, ?)`
  );
  insertMessage.run(
    "msg_upgrade",
    "mbx_upgrade",
    "inbox",
    "Upgrade",
    "addr_upgrade",
    timestamp,
    timestamp
  );
  insertMessage.run(
    "msg_unassigned_upgrade",
    null,
    "catchall",
    "Unassigned upgrade",
    null,
    timestamp,
    timestamp
  );
  database
    .prepare(
      `INSERT INTO drafts
         (id, user_id, mailbox_id, from_address, to_json, cc_json, bcc_json, subject,
          text_body, html_body, created_at, updated_at)
       VALUES
         ('drf_upgrade', 'usr_upgrade', 'mbx_upgrade', 'mailbox@example.com',
          '["reader@example.com"]', '[]', '[]', 'Draft', 'Draft body', '', ?, ?)`
    )
    .run(timestamp, timestamp);
}

describe("SQL migration contract", () => {
  it("keeps explicit before-deploy and after-deploy migration streams", () => {
    const names = readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();
    expect(names).toEqual(expectedMigrationNames);
    const afterDeployNames = readdirSync(afterDeployMigrationsDirectory, {
      withFileTypes: true
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();
    expect(afterDeployNames).toEqual(expectedAfterDeployMigrationNames);
  });

  it("keeps deferred foreign keys active until the migration transaction commits", () => {
    expect(oneAddressMigrationSource).not.toContain("defer_foreign_keys = OFF");
    expect(aliasCleanupMigrationSource).not.toContain("defer_foreign_keys = OFF");

    const database = createDatabase();
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE fk_parent (id TEXT PRIMARY KEY);
      CREATE TABLE fk_child (parent_id TEXT REFERENCES fk_parent(id));
      BEGIN;
      PRAGMA defer_foreign_keys = ON;
      INSERT INTO fk_child (parent_id) VALUES ('missing');
    `);
    expect(() => database.exec("COMMIT")).toThrow(/FOREIGN KEY constraint failed/);
    database.exec("ROLLBACK");
  });

  it("rejects ambiguous case-only legacy mailbox addresses", async () => {
    const database = createDatabase();
    const migrations = await readD1Migrations(migrationsDirectory);
    for (const migration of migrations.slice(0, -1)) applyMigration(database, migration);

    database.exec(`
      INSERT INTO mailboxes (id, address, display_name, created_at, updated_at)
      VALUES ('mbx_case', 'support@example.com', 'Support', 'now', 'now');
      INSERT INTO mail_domains (id, name, created_at, updated_at)
      VALUES ('dom_case', 'example.com', 'now', 'now');
      INSERT INTO mailbox_addresses (
        id, mailbox_id, mail_domain_id, local_part, address, display_name,
        receive_enabled, send_enabled, is_primary, created_at, updated_at
      ) VALUES
        ('addr_case_upper', 'mbx_case', 'dom_case', 'Sales', 'Sales@example.com',
         'Sales', 1, 1, 0, 'now', 'now'),
        ('addr_case_lower', 'mbx_case', 'dom_case', 'sales', 'sales@example.com',
         'Sales', 1, 1, 0, 'now', 'now');
    `);

    expect(() => applyMigration(database, migrations.at(-1))).toThrow(/UNIQUE constraint failed/);
    expect(database.prepare("SELECT COUNT(*) AS count FROM mailbox_addresses").get()).toEqual({
      count: 2
    });
    expect(
      database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'mailbox_address_migration'").get()
    ).toBeUndefined();
  });

  it("normalizes unmapped legacy mailboxes and rejects case-only duplicates", async () => {
    const migrations = await readD1Migrations(migrationsDirectory);
    const single = createDatabase();
    for (const migration of migrations.slice(0, -1)) applyMigration(single, migration);
    single.exec(`
      INSERT INTO mail_domains (id, name, created_at, updated_at)
      VALUES ('dom_unmapped', 'example.com', 'now', 'now');
      INSERT INTO mailboxes (id, address, display_name, created_at, updated_at)
      VALUES ('mbx_unmapped', 'Sales@Example.com', 'Sales', 'now', 'now');
    `);

    expect(applyMigration(single, migrations.at(-1))).toBe(true);
    expect(
      single
        .prepare("SELECT address, mail_domain_id FROM mailboxes WHERE id = 'mbx_unmapped'")
        .get()
    ).toEqual({ address: "sales@example.com", mail_domain_id: "dom_unmapped" });

    const duplicates = createDatabase();
    for (const migration of migrations.slice(0, -1)) applyMigration(duplicates, migration);
    duplicates.exec(`
      INSERT INTO mail_domains (id, name, created_at, updated_at)
      VALUES ('dom_duplicate', 'example.com', 'now', 'now');
      INSERT INTO mailboxes (id, address, display_name, created_at, updated_at) VALUES
        ('mbx_upper', 'Sales@example.com', 'Upper', 'now', 'now'),
        ('mbx_lower', 'sales@example.com', 'Lower', 'now', 'now');
    `);

    expect(() => applyMigration(duplicates, migrations.at(-1))).toThrow(/UNIQUE constraint failed/);
    expect(duplicates.prepare("SELECT address FROM mailboxes ORDER BY id").all()).toEqual([
      { address: "sales@example.com" },
      { address: "Sales@example.com" }
    ]);
  });

  it("applies every migration to a fresh database", async () => {
    const database = createDatabase();
    const migrations = await readD1Migrations(migrationsDirectory);
    const afterDeployMigrations = await readD1Migrations(afterDeployMigrationsDirectory);
    expect(migrations.map((migration) => migration.name)).toEqual(expectedMigrationNames);
    for (const migration of migrations) expect(applyMigration(database, migration)).toBe(true);
    for (const migration of afterDeployMigrations) {
      expect(applyMigration(database, migration, "d1_migrations_after_deploy")).toBe(true);
    }

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all();
    expect(tables).toHaveLength(40);
    expect(tables.map((table) => table.name)).not.toContain("mailbox_addresses");

    const mailboxColumns = database.prepare("PRAGMA table_info(mailboxes)").all();
    expect(mailboxColumns.map((column) => column.name)).toContain("mail_domain_id");
    const messageColumns = database.prepare("PRAGMA table_info(messages)").all();
    expect(messageColumns.map((column) => column.name)).toContain("delivered_to_address");
    expect(messageColumns.map((column) => column.name)).not.toContain("delivered_to_address_id");
    expect(messageColumns.map((column) => column.name)).not.toContain("sent_from_address_id");
    expect(
      database
        .prepare("SELECT installed_schema_version FROM release_state WHERE singleton = 1")
        .get()
    ).toEqual({ installed_schema_version: 3 });
  });

  it("preserves populated data through the latest upgrade and skips it on retry", async () => {
    const database = createDatabase();
    const migrations = await readD1Migrations(migrationsDirectory);
    const afterDeployMigrations = await readD1Migrations(afterDeployMigrationsDirectory);
    for (const migration of migrations.slice(0, -3)) applyMigration(database, migration);
    insertRepresentativeData(database);

    expect(applyMigration(database, migrations.at(-3))).toBe(true);
    expect(applyMigration(database, migrations.at(-2))).toBe(true);
    expect(applyMigration(database, migrations.at(-1))).toBe(true);
    expect(
      database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'mailbox_addresses'").get()
    ).toEqual({ 1: 1 });
    expect(
      database
        .prepare("PRAGMA table_info(messages)")
        .all()
        .map((column) => column.name)
    ).toEqual(expect.arrayContaining(["delivered_to_address_id", "sent_from_address_id"]));
    expect(
      applyMigration(database, afterDeployMigrations.at(-1), "d1_migrations_after_deploy")
    ).toBe(true);
    expect(database.prepare("SELECT id, email FROM user WHERE id = 'usr_upgrade'").get()).toEqual({
      id: "usr_upgrade",
      email: "upgrade@login.example"
    });
    expect(
      database.prepare("SELECT id, subject, version FROM drafts WHERE id = 'drf_upgrade'").get()
    ).toEqual({ id: "drf_upgrade", subject: "Draft", version: 1 });
    expect(
      database.prepare("SELECT mail_domain_id FROM mailboxes WHERE id = 'mbx_upgrade'").get()
    ).toEqual({ mail_domain_id: "dom_upgrade" });
    expect(
      database.prepare("SELECT delivered_to_address FROM messages WHERE id = 'msg_upgrade'").get()
    ).toEqual({ delivered_to_address: "mailbox@example.com" });
    expect(
      database
        .prepare("SELECT installed_schema_version FROM release_state WHERE singleton = 1")
        .get()
    ).toEqual({ installed_schema_version: 3 });
    expect(
      database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'mailbox_addresses'").get()
    ).toBeUndefined();
    expect(
      database
        .prepare("SELECT id, is_unassigned FROM messages WHERE id = 'msg_unassigned_upgrade'")
        .get()
    ).toEqual({ id: "msg_unassigned_upgrade", is_unassigned: 1 });
    expect(
      database
        .prepare(
          "SELECT is_unassigned FROM message_changes WHERE message_id = 'msg_unassigned_upgrade'"
        )
        .get()
    ).toEqual({ is_unassigned: 1 });

    expect(applyMigration(database, migrations.at(-1))).toBe(false);
    expect(
      applyMigration(database, afterDeployMigrations.at(-1), "d1_migrations_after_deploy")
    ).toBe(false);
    expect(database.prepare("SELECT count(*) AS count FROM d1_migrations").get()).toEqual({
      count: 16
    });
    expect(
      database.prepare("SELECT count(*) AS count FROM d1_migrations_after_deploy").get()
    ).toEqual({ count: 1 });
  });

  it("resets an interrupted database after the before-deploy phase", async () => {
    const database = createDatabase();
    const migrations = await readD1Migrations(migrationsDirectory);
    const afterDeployMigrations = await readD1Migrations(afterDeployMigrationsDirectory);
    for (const migration of migrations) applyMigration(database, migration);
    expect(
      database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'mailbox_address_migration'").get()
    ).toEqual({ 1: 1 });

    database.exec(resetSql);
    expect(
      database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'mailbox_address_migration'").get()
    ).toBeUndefined();
    database.exec(`
      CREATE TABLE d1_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE d1_migrations_after_deploy (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    for (const migration of migrations) expect(applyMigration(database, migration)).toBe(true);
    for (const migration of afterDeployMigrations) {
      expect(applyMigration(database, migration, "d1_migrations_after_deploy")).toBe(true);
    }
  });
});
