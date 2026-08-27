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
  "0016_one_address_per_mailbox.sql",
  "0017_agent_principals.sql",
  "0018_mailbox_lifecycle.sql",
  "0019_contacts.sql",
  "0020_labels.sql",
  "0021_email_signatures.sql",
  "0022_login_email_domain_exact_match.sql",
  "0023_message_sender_names.sql",
  "0024_draft_inline_images.sql",
  "0025_activate_catch_all_policy.sql",
  "0026_domain_disconnect.sql"
];
const expectedAfterDeployMigrationNames = [
  "0001_remove_mailbox_alias_storage.sql",
  "0002_finalize_agent_principals.sql"
];
const oneAddressMigrationSource = readFileSync(
  resolve(migrationsDirectory, "0016_one_address_per_mailbox.sql"),
  "utf8"
);
const aliasCleanupMigrationSource = readFileSync(
  resolve(afterDeployMigrationsDirectory, "0001_remove_mailbox_alias_storage.sql"),
  "utf8"
);
const agentMailboxLifecycleTriggerNames = [
  "agent_credentials_before_active_insert_with_deleted_mailbox",
  "agent_credentials_before_unrevoke_with_deleted_mailbox",
  "agents_before_agent_created_child",
  "mailbox_grants_before_agent_insert_on_deleted_mailbox",
  "mailbox_grants_before_agent_update_on_deleted_mailbox",
  "mailboxes_after_soft_delete_agent_access",
  "principals_before_agent_reenable_with_deleted_mailbox"
];
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

function migrationNamed(migrations, name) {
  const migration = migrations.find((candidate) => candidate.name === name);
  if (!migration) throw new Error(`Missing migration: ${name}`);
  return migration;
}

function applyBefore(database, migrations, name) {
  for (const migration of migrations) {
    if (migration.name === name) return;
    applyMigration(database, migration);
  }
  throw new Error(`Missing migration: ${name}`);
}

function lifecycleTriggerNames(database) {
  const placeholders = agentMailboxLifecycleTriggerNames.map(() => "?").join(", ");
  return database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name IN (${placeholders})
       ORDER BY name`
    )
    .all(...agentMailboxLifecycleTriggerNames)
    .map(({ name }) => name);
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
  database
    .prepare(
      `INSERT INTO draft_attachments
         (id, draft_id, filename, content_type, size_bytes, r2_key, created_at)
       VALUES ('att_upgrade', 'drf_upgrade', 'upgrade.txt', 'text/plain', 7,
               'drafts/usr_upgrade/drf_upgrade/att_upgrade', ?)`
    )
    .run(timestamp);
  database
    .prepare(
      `INSERT INTO mailbox_grants
         (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
       VALUES ('mbx_upgrade', 'usr_upgrade', 'agent', 'usr_upgrade', ?, ?)`
    )
    .run(timestamp, timestamp);
  database
    .prepare(
      `INSERT INTO audit_events
         (id, occurred_at, correlation_id, actor_type, actor_id, action, resource_type,
          resource_id, outcome, metadata_json)
       VALUES ('aud_upgrade', ?, 'req_upgrade', 'user', 'usr_upgrade', 'draft.create',
               'draft', 'drf_upgrade', 'success', '{}')`
    )
    .run(timestamp);
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

  it("preserves existing unmatched mail behavior before activating domain policies", async () => {
    const migrations = await readD1Migrations(migrationsDirectory);
    const database = createDatabase();
    applyBefore(database, migrations, "0025_activate_catch_all_policy.sql");
    const timestamp = "2026-08-26T12:00:00.000Z";
    database.exec(`
      INSERT INTO mail_domains
        (id, name, receiving_status, sending_status, dns_status, catch_all_policy,
         is_enabled, created_at, updated_at)
      VALUES
        ('dom_reject', 'reject.example', 'ready', 'ready', 'ready', 'reject', 1,
         '${timestamp}', '${timestamp}'),
        ('dom_mailbox', 'mailbox.example', 'ready', 'ready', 'ready', 'reject', 1,
         '${timestamp}', '${timestamp}');
      INSERT INTO mailboxes
        (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
      VALUES
        ('mbx_catchall', 'hello@mailbox.example', 'dom_mailbox', 'Hello', 1,
         '${timestamp}', '${timestamp}');
      UPDATE mail_domains
      SET catch_all_policy = 'mailbox', catch_all_mailbox_id = 'mbx_catchall'
      WHERE id = 'dom_mailbox';
    `);

    expect(
      applyMigration(database, migrationNamed(migrations, "0025_activate_catch_all_policy.sql"))
    ).toBe(true);
    expect(
      database
        .prepare("SELECT id, catch_all_policy, catch_all_mailbox_id FROM mail_domains ORDER BY id")
        .all()
    ).toEqual([
      { id: "dom_mailbox", catch_all_policy: "unassigned", catch_all_mailbox_id: null },
      { id: "dom_reject", catch_all_policy: "unassigned", catch_all_mailbox_id: null }
    ]);
  });

  it("keeps existing domains connected when adding disconnect state", async () => {
    const migrations = await readD1Migrations(migrationsDirectory);
    const database = createDatabase();
    applyBefore(database, migrations, "0026_domain_disconnect.sql");
    const timestamp = "2026-08-27T12:00:00.000Z";
    database
      .prepare(
        `INSERT INTO mail_domains
           (id, name, receiving_status, sending_status, dns_status, catch_all_policy,
            is_enabled, created_at, updated_at)
         VALUES ('dom_connected', 'connected.example', 'ready', 'ready', 'ready',
                 'unassigned', 1, ?, ?)`
      )
      .run(timestamp, timestamp);

    expect(applyMigration(database, migrationNamed(migrations, "0026_domain_disconnect.sql"))).toBe(
      true
    );
    expect(
      database.prepare("SELECT disconnected_at FROM mail_domains WHERE id = 'dom_connected'").get()
    ).toEqual({ disconnected_at: null });
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
    applyBefore(database, migrations, "0016_one_address_per_mailbox.sql");

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

    expect(() =>
      applyMigration(database, migrationNamed(migrations, "0016_one_address_per_mailbox.sql"))
    ).toThrow(/UNIQUE constraint failed/);
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
    applyBefore(single, migrations, "0016_one_address_per_mailbox.sql");
    single.exec(`
      INSERT INTO mail_domains (id, name, created_at, updated_at)
      VALUES ('dom_unmapped', 'example.com', 'now', 'now');
      INSERT INTO mailboxes (id, address, display_name, created_at, updated_at)
      VALUES ('mbx_unmapped', 'Sales@Example.com', 'Sales', 'now', 'now');
    `);

    expect(
      applyMigration(single, migrationNamed(migrations, "0016_one_address_per_mailbox.sql"))
    ).toBe(true);
    expect(
      single
        .prepare("SELECT address, mail_domain_id FROM mailboxes WHERE id = 'mbx_unmapped'")
        .get()
    ).toEqual({ address: "sales@example.com", mail_domain_id: "dom_unmapped" });

    const duplicates = createDatabase();
    applyBefore(duplicates, migrations, "0016_one_address_per_mailbox.sql");
    duplicates.exec(`
      INSERT INTO mail_domains (id, name, created_at, updated_at)
      VALUES ('dom_duplicate', 'example.com', 'now', 'now');
      INSERT INTO mailboxes (id, address, display_name, created_at, updated_at) VALUES
        ('mbx_upper', 'Sales@example.com', 'Upper', 'now', 'now'),
        ('mbx_lower', 'sales@example.com', 'Lower', 'now', 'now');
    `);

    expect(() =>
      applyMigration(duplicates, migrationNamed(migrations, "0016_one_address_per_mailbox.sql"))
    ).toThrow(/UNIQUE constraint failed/);
    expect(duplicates.prepare("SELECT address FROM mailboxes ORDER BY id").all()).toEqual([
      { address: "sales@example.com" },
      { address: "Sales@example.com" }
    ]);
  });

  it("keeps the agent migration compatible with Wrangler's trigger splitter", () => {
    const sql = readFileSync(resolve(migrationsDirectory, "0017_agent_principals.sql"), "utf8");
    expect(sql).not.toMatch(/\bCASE\b/i);
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
    expect(tables).toHaveLength(47);
    expect(tables.map((table) => table.name)).not.toContain("mailbox_addresses");

    const mailboxColumns = database.prepare("PRAGMA table_info(mailboxes)").all();
    expect(mailboxColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["mail_domain_id", "kind", "deleted_at"])
    );
    const grantColumns = database.prepare("PRAGMA table_info(mailbox_grants)").all();
    expect(grantColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["principal_id", "created_by_principal_id"])
    );
    expect(grantColumns.map((column) => column.name)).not.toContain("user_id");
    const draftColumns = database.prepare("PRAGMA table_info(drafts)").all();
    expect(draftColumns.map((column) => column.name)).toContain("principal_id");
    expect(draftColumns.map((column) => column.name)).not.toContain("user_id");
    const draftAttachmentColumns = database.prepare("PRAGMA table_info(draft_attachments)").all();
    expect(draftAttachmentColumns.map((column) => column.name)).toContain("content_id");
    const messageColumns = database.prepare("PRAGMA table_info(messages)").all();
    expect(messageColumns.map((column) => column.name)).toContain("delivered_to_address");
    expect(messageColumns.map((column) => column.name)).toContain("from_name");
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
    applyBefore(database, migrations, "0014_unassigned_messages.sql");
    insertRepresentativeData(database);

    expect(
      applyMigration(database, migrationNamed(migrations, "0014_unassigned_messages.sql"))
    ).toBe(true);
    expect(applyMigration(database, migrationNamed(migrations, "0015_draft_changes.sql"))).toBe(
      true
    );
    expect(
      applyMigration(database, migrationNamed(migrations, "0016_one_address_per_mailbox.sql"))
    ).toBe(true);
    expect(applyMigration(database, migrationNamed(migrations, "0017_agent_principals.sql"))).toBe(
      true
    );

    const transitionGrantColumns = database.prepare("PRAGMA table_info(mailbox_grants)").all();
    expect(transitionGrantColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["user_id", "principal_id", "created_by", "created_by_principal_id"])
    );
    const transitionDraftColumns = database.prepare("PRAGMA table_info(drafts)").all();
    expect(transitionDraftColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["user_id", "principal_id"])
    );
    expect(() =>
      database
        .prepare(
          `UPDATE mailbox_grants SET access_level = 'read'
           WHERE mailbox_id = 'mbx_upgrade' AND user_id = 'usr_upgrade'`
        )
        .run()
    ).toThrow(/mailbox migration is in progress/);

    database.exec(`
      INSERT INTO mailboxes (
        id, address, mail_domain_id, display_name, created_at, updated_at
      ) VALUES (
        'mbx_old_worker', 'old-worker@example.com', 'dom_upgrade', 'Old Worker',
        '2026-08-23T12:00:00.000Z', '2026-08-23T12:00:00.000Z'
      );
      INSERT INTO mailbox_grants (
        mailbox_id, user_id, access_level, created_by, created_at, updated_at
      ) VALUES (
        'mbx_old_worker', 'usr_upgrade', 'manager', 'usr_upgrade',
        '2026-08-23T12:00:00.000Z', '2026-08-23T12:00:00.000Z'
      );
      INSERT INTO drafts (
        id, user_id, mailbox_id, from_address, to_json, cc_json, bcc_json,
        subject, text_body, html_body, created_at, updated_at
      ) VALUES (
        'drf_old_worker', 'usr_upgrade', 'mbx_old_worker', 'old-worker@example.com',
        '[]', '[]', '[]', 'Old Worker draft', '', '',
        '2026-08-23T12:00:00.000Z', '2026-08-23T12:00:00.000Z'
      );
    `);
    expect(
      database
        .prepare(
          `SELECT user_id, principal_id, created_by, created_by_principal_id
           FROM mailbox_grants WHERE mailbox_id = 'mbx_old_worker'`
        )
        .get()
    ).toEqual({
      user_id: "usr_upgrade",
      principal_id: "usr_upgrade",
      created_by: "usr_upgrade",
      created_by_principal_id: "usr_upgrade"
    });
    expect(
      database.prepare("SELECT user_id, principal_id FROM drafts WHERE id = 'drf_old_worker'").get()
    ).toEqual({ user_id: "usr_upgrade", principal_id: "usr_upgrade" });

    database.prepare("UPDATE drafts SET subject = 'Draft updated' WHERE id = 'drf_upgrade'").run();
    expect(applyMigration(database, migrationNamed(migrations, "0018_mailbox_lifecycle.sql"))).toBe(
      true
    );
    expect(applyMigration(database, migrationNamed(migrations, "0019_contacts.sql"))).toBe(true);
    expect(applyMigration(database, migrationNamed(migrations, "0020_labels.sql"))).toBe(true);
    expect(applyMigration(database, migrationNamed(migrations, "0021_email_signatures.sql"))).toBe(
      true
    );
    expect(
      applyMigration(
        database,
        migrationNamed(migrations, "0022_login_email_domain_exact_match.sql")
      )
    ).toBe(true);
    expect(
      applyMigration(database, migrationNamed(migrations, "0023_message_sender_names.sql"))
    ).toBe(true);
    expect(
      applyMigration(database, migrationNamed(migrations, "0024_draft_inline_images.sql"))
    ).toBe(true);
    expect(
      applyMigration(database, migrationNamed(migrations, "0025_activate_catch_all_policy.sql"))
    ).toBe(true);
    database
      .prepare("UPDATE draft_attachments SET content_id = ? WHERE id = 'att_upgrade'")
      .run("att_upgrade@hqbase.invalid");
    expect(
      database.prepare("SELECT from_name FROM messages WHERE id = 'msg_upgrade'").get()
    ).toEqual({ from_name: null });

    database.exec(`
      INSERT INTO contacts (
        user_id, email, name, notes, created_at, updated_at
      ) VALUES (
        'usr_upgrade', 'sender@example.com', 'Upgrade sender', 'Private upgrade note',
        '2026-08-23T12:02:00.000Z', '2026-08-23T12:02:00.000Z'
      );
      INSERT INTO labels (
        id, name, color, created_by_user_id, created_at, updated_at
      ) VALUES (
        'lbl_upgrade', 'Upgrade label', 'blue', 'usr_upgrade',
        '2026-08-23T12:02:00.000Z', '2026-08-23T12:02:00.000Z'
      );
      INSERT INTO message_labels (
        message_id, label_id, assigned_by_principal_id, created_at
      ) VALUES (
        'msg_upgrade', 'lbl_upgrade', 'usr_upgrade', '2026-08-23T12:02:00.000Z'
      );
    `);

    database.exec(`
      INSERT INTO principals (id, type, name, status, created_at, updated_at)
      VALUES (
        'agt_upgrade', 'agent', 'Upgrade agent', 'active',
        '2026-08-23T12:01:00.000Z', '2026-08-23T12:01:00.000Z'
      );
      INSERT INTO agents (
        principal_id, profile, created_by_principal_id, mail_domain_id, mailbox_limit,
        created_at, updated_at
      ) VALUES (
        'agt_upgrade', 'mailbox', 'usr_upgrade', 'dom_upgrade', NULL,
        '2026-08-23T12:01:00.000Z', '2026-08-23T12:01:00.000Z'
      );
      INSERT INTO mailboxes (
        id, address, mail_domain_id, display_name, kind, created_at, updated_at
      ) VALUES
        ('mbx_new_human', 'new-human@example.com', 'dom_upgrade', 'New Human', 'human',
         '2026-08-23T12:01:00.000Z', '2026-08-23T12:01:00.000Z'),
        ('mbx_new_agent', 'new-agent@example.com', 'dom_upgrade', 'New Agent', 'agent',
         '2026-08-23T12:01:00.000Z', '2026-08-23T12:01:00.000Z');
      INSERT INTO mailbox_grants (
        mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at
      ) VALUES
        ('mbx_new_human', 'usr_upgrade', 'manager', 'usr_upgrade',
         '2026-08-23T12:01:00.000Z', '2026-08-23T12:01:00.000Z'),
        ('mbx_new_agent', 'agt_upgrade', 'agent', 'usr_upgrade',
         '2026-08-23T12:01:00.000Z', '2026-08-23T12:01:00.000Z');
      INSERT INTO drafts (
        id, principal_id, mailbox_id, from_address, to_json, cc_json, bcc_json,
        subject, text_body, html_body, created_at, updated_at
      ) VALUES
        ('drf_new_human', 'usr_upgrade', 'mbx_new_human', 'new-human@example.com',
         '[]', '[]', '[]', 'New human draft', '', '',
         '2026-08-23T12:01:00.000Z', '2026-08-23T12:01:00.000Z'),
        ('drf_new_agent', 'agt_upgrade', 'mbx_new_agent', 'new-agent@example.com',
         '[]', '[]', '[]', 'New agent draft', '', '',
         '2026-08-23T12:01:00.000Z', '2026-08-23T12:01:00.000Z');
    `);
    expect(
      database
        .prepare(
          `SELECT mailbox_id, user_id, principal_id
           FROM mailbox_grants WHERE mailbox_id IN ('mbx_new_agent', 'mbx_new_human')
           ORDER BY mailbox_id`
        )
        .all()
    ).toEqual([
      { mailbox_id: "mbx_new_agent", user_id: null, principal_id: "agt_upgrade" },
      { mailbox_id: "mbx_new_human", user_id: "usr_upgrade", principal_id: "usr_upgrade" }
    ]);
    expect(
      database
        .prepare(
          `SELECT id, user_id, principal_id FROM drafts
           WHERE id IN ('drf_new_agent', 'drf_new_human') ORDER BY id`
        )
        .all()
    ).toEqual([
      { id: "drf_new_agent", user_id: null, principal_id: "agt_upgrade" },
      { id: "drf_new_human", user_id: "usr_upgrade", principal_id: "usr_upgrade" }
    ]);

    expect(
      database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'mailbox_addresses'").get()
    ).toEqual({ 1: 1 });
    expect(
      database
        .prepare("PRAGMA table_info(messages)")
        .all()
        .map((column) => column.name)
    ).toEqual(expect.arrayContaining(["delivered_to_address_id", "sent_from_address_id"]));
    for (const migration of afterDeployMigrations) {
      expect(applyMigration(database, migration, "d1_migrations_after_deploy")).toBe(true);
    }
    expect(database.prepare("SELECT id, email FROM user WHERE id = 'usr_upgrade'").get()).toEqual({
      id: "usr_upgrade",
      email: "upgrade@login.example"
    });
    expect(
      database
        .prepare("SELECT id, principal_id, subject, version FROM drafts WHERE id = 'drf_upgrade'")
        .get()
    ).toEqual({
      id: "drf_upgrade",
      principal_id: "usr_upgrade",
      subject: "Draft updated",
      version: 1
    });
    expect(
      database
        .prepare(
          "SELECT id, draft_id, content_id, r2_key FROM draft_attachments WHERE id = 'att_upgrade'"
        )
        .get()
    ).toEqual({
      id: "att_upgrade",
      draft_id: "drf_upgrade",
      content_id: "att_upgrade@hqbase.invalid",
      r2_key: "drafts/usr_upgrade/drf_upgrade/att_upgrade"
    });
    expect(
      database
        .prepare("PRAGMA index_list('draft_attachments')")
        .all()
        .find((index) => index.name === "draft_attachments_content_id_uidx")
    ).toMatchObject({ partial: 1, unique: 1 });
    expect(() =>
      database
        .prepare(
          `INSERT INTO draft_attachments
           (id, draft_id, filename, content_type, size_bytes, content_id, r2_key, created_at)
           VALUES ('att_duplicate', 'drf_upgrade', 'duplicate.png', 'image/png', 1, ?,
                   'drafts/usr_upgrade/drf_upgrade/att_duplicate',
                   '2026-08-23T12:03:00.000Z')`
        )
        .run("att_upgrade@hqbase.invalid")
    ).toThrow(/UNIQUE constraint failed/);
    expect(
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM draft_changes
           WHERE draft_id = 'drf_upgrade' AND principal_id = 'usr_upgrade' AND kind = 'upsert'`
        )
        .get()
    ).toEqual({ count: 1 });
    expect(
      database
        .prepare(
          `SELECT mailbox_id, principal_id, access_level, created_by_principal_id
           FROM mailbox_grants WHERE mailbox_id = 'mbx_upgrade'`
        )
        .get()
    ).toEqual({
      mailbox_id: "mbx_upgrade",
      principal_id: "usr_upgrade",
      access_level: "agent",
      created_by_principal_id: "usr_upgrade"
    });
    expect(
      database.prepare("SELECT id, type, status FROM principals WHERE id = 'usr_upgrade'").get()
    ).toEqual({ id: "usr_upgrade", type: "user", status: "active" });
    expect(database.prepare("SELECT kind FROM mailboxes WHERE id = 'mbx_upgrade'").get()).toEqual({
      kind: "human"
    });
    expect(
      database
        .prepare("SELECT actor_type, actor_id FROM audit_events WHERE id = 'aud_upgrade'")
        .get()
    ).toEqual({ actor_type: "user", actor_id: "usr_upgrade" });
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
    expect(
      database
        .prepare("SELECT email, name, notes FROM contacts WHERE user_id = 'usr_upgrade'")
        .get()
    ).toEqual({
      email: "sender@example.com",
      name: "Upgrade sender",
      notes: "Private upgrade note"
    });
    expect(
      database
        .prepare(
          `SELECT label.name, label.color
           FROM message_labels assignment
           JOIN labels label ON label.id = assignment.label_id
           WHERE assignment.message_id = 'msg_upgrade'`
        )
        .get()
    ).toEqual({ name: "Upgrade label", color: "blue" });

    expect(applyMigration(database, migrationNamed(migrations, "0018_mailbox_lifecycle.sql"))).toBe(
      false
    );
    expect(
      applyMigration(
        database,
        migrationNamed(afterDeployMigrations, "0002_finalize_agent_principals.sql"),
        "d1_migrations_after_deploy"
      )
    ).toBe(false);
    expect(database.prepare("SELECT count(*) AS count FROM d1_migrations").get()).toEqual({
      count: 25
    });
    expect(
      database.prepare("SELECT count(*) AS count FROM d1_migrations_after_deploy").get()
    ).toEqual({ count: 2 });
  });

  it("closes deleted agent mailboxes before and after principal finalization", async () => {
    const database = createDatabase();
    const migrations = await readD1Migrations(migrationsDirectory);
    const afterDeployMigrations = await readD1Migrations(afterDeployMigrationsDirectory);
    for (const migration of migrations) applyMigration(database, migration);

    const createdAt = "2026-08-23T15:00:00.000Z";
    const deletedAt = "2026-08-23T15:01:00.000Z";
    database.exec(`
      INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES (
        'usr_lifecycle', 'Lifecycle owner', 'lifecycle@login.example', 1,
        '${createdAt}', '${createdAt}'
      );
      INSERT INTO mail_domains (id, name, created_at, updated_at)
      VALUES ('dom_lifecycle', 'lifecycle.example', '${createdAt}', '${createdAt}');
      INSERT INTO mailboxes (
        id, address, mail_domain_id, display_name, kind, created_at, updated_at
      ) VALUES
        ('mbx_lifecycle', 'agent@lifecycle.example', 'dom_lifecycle', 'Agent', 'agent',
         '${createdAt}', '${createdAt}'),
        ('mbx_lifecycle_active', 'active@lifecycle.example', 'dom_lifecycle', 'Active',
         'agent', '${createdAt}', '${createdAt}');
      INSERT INTO principals (id, type, name, status, created_at, updated_at)
      VALUES
        ('agt_lifecycle', 'agent', 'Lifecycle agent', 'active', '${createdAt}', '${createdAt}'),
        ('agt_lifecycle_second', 'agent', 'Second agent', 'active',
         '${createdAt}', '${createdAt}');
      INSERT INTO agents (
        principal_id, profile, created_by_principal_id, mail_domain_id, mailbox_limit,
        created_at, updated_at
      ) VALUES
        ('agt_lifecycle', 'mailbox', 'usr_lifecycle', 'dom_lifecycle', NULL,
         '${createdAt}', '${createdAt}'),
        ('agt_lifecycle_second', 'mailbox', 'usr_lifecycle', 'dom_lifecycle', NULL,
         '${createdAt}', '${createdAt}');
      INSERT INTO mailbox_grants (
        mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at
      ) VALUES
        ('mbx_lifecycle', 'agt_lifecycle', 'agent', 'usr_lifecycle',
         '${createdAt}', '${createdAt}'),
        ('mbx_lifecycle_active', 'agt_lifecycle', 'agent', 'usr_lifecycle',
         '${createdAt}', '${createdAt}');
      INSERT INTO agent_credentials (
        id, principal_id, secret_hash, resource, scopes_json, created_at
      ) VALUES (
        'cred_lifecycle', 'agt_lifecycle', 'hash_lifecycle', 'mail', '["mail:read"]',
        '${createdAt}'
      );
    `);

    expect(lifecycleTriggerNames(database)).toEqual(agentMailboxLifecycleTriggerNames);
    database
      .prepare("UPDATE mailboxes SET deleted_at = ?, updated_at = ? WHERE id = 'mbx_lifecycle'")
      .run(deletedAt, deletedAt);
    expect(
      database.prepare("SELECT status, updated_at FROM principals WHERE id = 'agt_lifecycle'").get()
    ).toEqual({ status: "disabled", updated_at: deletedAt });
    expect(
      database.prepare("SELECT revoked_at FROM agent_credentials WHERE id = 'cred_lifecycle'").get()
    ).toEqual({ revoked_at: deletedAt });

    expect(() =>
      database.exec(`
        INSERT INTO agent_credentials (
          id, principal_id, secret_hash, resource, scopes_json, created_at
        ) VALUES (
          'cred_lifecycle_blocked', 'agt_lifecycle', 'hash_lifecycle_blocked', 'mail',
          '["mail:read"]', '${deletedAt}'
        )
      `)
    ).toThrow(/AGENT_MAILBOX_DELETED/);
    expect(() =>
      database.prepare("UPDATE principals SET status = 'active' WHERE id = 'agt_lifecycle'").run()
    ).toThrow(/AGENT_MAILBOX_DELETED/);
    expect(() =>
      database
        .prepare("UPDATE agent_credentials SET revoked_at = NULL WHERE id = 'cred_lifecycle'")
        .run()
    ).toThrow(/AGENT_MAILBOX_DELETED/);
    expect(() =>
      database
        .prepare(
          `UPDATE mailbox_grants SET access_level = 'read'
           WHERE mailbox_id = 'mbx_lifecycle_active' AND principal_id = 'agt_lifecycle'`
        )
        .run()
    ).toThrow(/AGENT_MAILBOX_DELETED/);
    expect(() =>
      database.exec(`
        INSERT INTO mailbox_grants (
          mailbox_id, principal_id, access_level, created_by_principal_id,
          created_at, updated_at
        ) VALUES (
          'mbx_lifecycle', 'agt_lifecycle_second', 'read', 'usr_lifecycle',
          '${deletedAt}', '${deletedAt}'
        )
      `)
    ).toThrow(/AGENT_MAILBOX_DELETED/);
    expect(() =>
      database.exec(`
        INSERT INTO mailbox_grants (
          mailbox_id, principal_id, access_level, created_by_principal_id,
          created_at, updated_at
        ) VALUES (
          'mbx_lifecycle_active', 'agt_lifecycle', 'read', 'usr_lifecycle',
          '${deletedAt}', '${deletedAt}'
        )
      `)
    ).toThrow(/AGENT_MAILBOX_DELETED/);

    for (const migration of afterDeployMigrations) {
      applyMigration(database, migration, "d1_migrations_after_deploy");
    }
    expect(lifecycleTriggerNames(database)).toEqual(agentMailboxLifecycleTriggerNames);
    expect(() =>
      database.prepare("UPDATE principals SET status = 'active' WHERE id = 'agt_lifecycle'").run()
    ).toThrow(/AGENT_MAILBOX_DELETED/);
    expect(() =>
      database.exec(`
        INSERT INTO agent_credentials (
          id, principal_id, secret_hash, resource, scopes_json, created_at
        ) VALUES (
          'cred_lifecycle_final_blocked', 'agt_lifecycle', 'hash_lifecycle_final_blocked',
          'mail', '["mail:read"]', '${deletedAt}'
        )
      `)
    ).toThrow(/AGENT_MAILBOX_DELETED/);
    expect(() =>
      database
        .prepare("UPDATE agent_credentials SET revoked_at = NULL WHERE id = 'cred_lifecycle'")
        .run()
    ).toThrow(/AGENT_MAILBOX_DELETED/);
    expect(() =>
      database
        .prepare(
          `UPDATE mailbox_grants SET access_level = 'read'
           WHERE mailbox_id = 'mbx_lifecycle_active' AND principal_id = 'agt_lifecycle'`
        )
        .run()
    ).toThrow(/AGENT_MAILBOX_DELETED/);
    expect(() =>
      database.exec(`
        INSERT INTO mailbox_grants (
          mailbox_id, principal_id, access_level, created_by_principal_id,
          created_at, updated_at
        ) VALUES (
          'mbx_lifecycle', 'agt_lifecycle_second', 'read', 'usr_lifecycle',
          '${deletedAt}', '${deletedAt}'
        )
      `)
    ).toThrow(/AGENT_MAILBOX_DELETED/);

    const restoredAt = "2026-08-23T15:02:00.000Z";
    database
      .prepare("UPDATE mailboxes SET deleted_at = NULL, updated_at = ? WHERE id = 'mbx_lifecycle'")
      .run(restoredAt);
    database
      .prepare("UPDATE principals SET status = 'active', updated_at = ? WHERE id = 'agt_lifecycle'")
      .run(restoredAt);
    database
      .prepare(
        `INSERT INTO agent_credentials (
           id, principal_id, secret_hash, resource, scopes_json, created_at
         ) VALUES (
           'cred_lifecycle_restored', 'agt_lifecycle', 'hash_lifecycle_restored', 'mail',
           '["mail:read"]', ?
         )`
      )
      .run(restoredAt);
    database
      .prepare(
        `UPDATE mailbox_grants SET access_level = 'read', updated_at = ?
         WHERE mailbox_id = 'mbx_lifecycle' AND principal_id = 'agt_lifecycle'`
      )
      .run(restoredAt);

    const deletedAgainAt = "2026-08-23T15:03:00.000Z";
    database
      .prepare("UPDATE mailboxes SET deleted_at = ?, updated_at = ? WHERE id = 'mbx_lifecycle'")
      .run(deletedAgainAt, deletedAgainAt);
    expect(
      database
        .prepare(
          `SELECT principal.status, credential.revoked_at
           FROM principals principal
           JOIN agent_credentials credential ON credential.principal_id = principal.id
           WHERE principal.id = 'agt_lifecycle'
             AND credential.id = 'cred_lifecycle_restored'`
        )
        .get()
    ).toEqual({ status: "disabled", revoked_at: deletedAgainAt });
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

  it("backfills only mailboxes created with their mailbox agent", async () => {
    const database = createDatabase();
    const migrations = await readD1Migrations(migrationsDirectory);
    applyBefore(database, migrations, "0018_mailbox_lifecycle.sql");

    const oldTimestamp = "2026-08-20T12:00:00.000Z";
    const agentTimestamp = "2026-08-23T12:00:00.000Z";
    database
      .prepare(
        `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES ('usr_kind', 'Mailbox owner', 'owner@login.example', 1, ?, ?)`
      )
      .run(oldTimestamp, oldTimestamp);
    database
      .prepare(
        `INSERT INTO mail_domains (id, name, created_at, updated_at)
         VALUES ('dom_kind', 'example.com', ?, ?)`
      )
      .run(oldTimestamp, oldTimestamp);
    database
      .prepare(
        `INSERT INTO mailboxes (
           id, address, mail_domain_id, display_name, created_at, updated_at
         )
         VALUES
           ('mbx_human_kind', 'human@example.com', 'dom_kind', 'Human', ?, ?),
           ('mbx_agent_kind', 'agent@example.com', 'dom_kind', 'Agent', ?, ?)`
      )
      .run(oldTimestamp, oldTimestamp, agentTimestamp, agentTimestamp);
    database.exec(`
      INSERT INTO principals (id, type, name, status, created_at, updated_at)
      VALUES
        ('agt_existing_kind', 'agent', 'Existing mailbox agent', 'active',
         '${agentTimestamp}', '${agentTimestamp}'),
        ('agt_dedicated_kind', 'agent', 'Dedicated mailbox agent', 'active',
         '${agentTimestamp}', '${agentTimestamp}');

      INSERT INTO agents (
        principal_id, profile, created_by_principal_id, mail_domain_id, mailbox_limit,
        created_at, updated_at
      ) VALUES
        ('agt_existing_kind', 'mailbox', 'usr_kind', 'dom_kind', NULL,
         '${agentTimestamp}', '${agentTimestamp}'),
        ('agt_dedicated_kind', 'mailbox', 'usr_kind', 'dom_kind', NULL,
         '${agentTimestamp}', '${agentTimestamp}');

      INSERT INTO mailbox_grants (
        mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at
      ) VALUES
        ('mbx_human_kind', 'agt_existing_kind', 'read', 'usr_kind',
         '${agentTimestamp}', '${agentTimestamp}'),
        ('mbx_agent_kind', 'agt_dedicated_kind', 'read', 'usr_kind',
         '${agentTimestamp}', '${agentTimestamp}');
    `);

    expect(applyMigration(database, migrationNamed(migrations, "0018_mailbox_lifecycle.sql"))).toBe(
      true
    );
    expect(database.prepare("SELECT id, kind FROM mailboxes ORDER BY id").all()).toEqual([
      { id: "mbx_agent_kind", kind: "agent" },
      { id: "mbx_human_kind", kind: "human" }
    ]);
  });
});
