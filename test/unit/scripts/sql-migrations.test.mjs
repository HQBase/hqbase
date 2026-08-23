import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { afterEach, describe, expect, it } from "vitest";

const migrationsDirectory = resolve(import.meta.dirname, "../../../migrations");
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
  "0016_agent_principals.sql",
  "0017_mailbox_kind.sql"
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
  `);
  databases.push(database);
  return database;
}

function applyMigration(database, migration) {
  const applied = database
    .prepare("SELECT 1 FROM d1_migrations WHERE name = ?")
    .get(migration.name);
  if (applied) return false;

  database.exec("BEGIN");
  try {
    for (const query of migration.queries) database.exec(query);
    database.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(migration.name);
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
       VALUES ('usr_upgrade', 'Upgrade', 'upgrade@example.com', 1, ?, ?)`
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
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES ('thr_upgrade', 'upgrade', ?, ?, ?)`
    )
    .run(timestamp, timestamp, timestamp);
  const insertMessage = database.prepare(
    `INSERT INTO messages
       (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json,
        bcc_json, subject, snippet, text_body, references_json, created_at, updated_at)
     VALUES (?, 'thr_upgrade', ?, 'inbound', ?, 'sender@example.com',
       '["mailbox@example.com"]', '[]', '[]', ?, 'Upgrade message', 'Upgrade message',
       '[]', ?, ?)`
  );
  insertMessage.run("msg_upgrade", "mbx_upgrade", "inbox", "Upgrade", timestamp, timestamp);
  insertMessage.run(
    "msg_unassigned_upgrade",
    null,
    "catchall",
    "Unassigned upgrade",
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
  it("keeps one numbered top-level migration stream", () => {
    const names = readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();
    expect(names).toEqual(expectedMigrationNames);
  });

  it("keeps the agent migration compatible with Wrangler's trigger splitter", () => {
    const sql = readFileSync(resolve(migrationsDirectory, "0016_agent_principals.sql"), "utf8");
    expect(sql).not.toMatch(/\bCASE\b/i);
  });

  it("applies every migration to a fresh database", async () => {
    const database = createDatabase();
    const migrations = await readD1Migrations(migrationsDirectory);
    expect(migrations.map((migration) => migration.name)).toEqual(expectedMigrationNames);
    for (const migration of migrations) expect(applyMigration(database, migration)).toBe(true);

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all();
    expect(tables).toHaveLength(43);
  });

  it("preserves populated data through the latest upgrade and skips it on retry", async () => {
    const database = createDatabase();
    const migrations = await readD1Migrations(migrationsDirectory);
    for (const migration of migrations.slice(0, -4)) applyMigration(database, migration);
    insertRepresentativeData(database);

    expect(applyMigration(database, migrations.at(-4))).toBe(true);
    expect(applyMigration(database, migrations.at(-3))).toBe(true);
    database.prepare("UPDATE drafts SET subject = 'Draft updated' WHERE id = 'drf_upgrade'").run();
    expect(applyMigration(database, migrations.at(-2))).toBe(true);
    expect(applyMigration(database, migrations.at(-1))).toBe(true);
    expect(database.prepare("SELECT id, email FROM user WHERE id = 'usr_upgrade'").get()).toEqual({
      id: "usr_upgrade",
      email: "upgrade@example.com"
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
        .prepare("SELECT id, draft_id, r2_key FROM draft_attachments WHERE id = 'att_upgrade'")
        .get()
    ).toEqual({
      id: "att_upgrade",
      draft_id: "drf_upgrade",
      r2_key: "drafts/usr_upgrade/drf_upgrade/att_upgrade"
    });
    expect(
      database
        .prepare("SELECT principal_id, kind FROM draft_changes WHERE draft_id = 'drf_upgrade'")
        .all()
    ).toEqual([{ principal_id: "usr_upgrade", kind: "upsert" }]);
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
    expect(database.prepare("SELECT count(*) AS count FROM d1_migrations").get()).toEqual({
      count: 17
    });
  });

  it("backfills only mailboxes created with their mailbox agent", async () => {
    const database = createDatabase();
    const migrations = await readD1Migrations(migrationsDirectory);
    for (const migration of migrations.slice(0, -1)) applyMigration(database, migration);

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
        `INSERT INTO mailboxes (id, address, display_name, created_at, updated_at)
         VALUES
           ('mbx_human_kind', 'human@example.com', 'Human', ?, ?),
           ('mbx_agent_kind', 'agent@example.com', 'Agent', ?, ?)`
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

    expect(applyMigration(database, migrations.at(-1))).toBe(true);
    expect(database.prepare("SELECT id, kind FROM mailboxes ORDER BY id").all()).toEqual([
      { id: "mbx_agent_kind", kind: "agent" },
      { id: "mbx_human_kind", kind: "human" }
    ]);
  });
});
