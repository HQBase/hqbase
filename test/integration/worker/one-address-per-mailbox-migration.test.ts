import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import workspaceMigration from "../../../migrations/0002_workspace.sql?raw";
import oauthResourcesMigration from "../../../migrations/0003_oauth_resources.sql?raw";
import conversationMigration from "../../../migrations/0004_conversations.sql?raw";
import threadRebuildMigration from "../../../migrations/0005_rebuild_threads.sql?raw";
import pushMigration from "../../../migrations/0006_push_notifications.sql?raw";
import userMailPreferencesMigration from "../../../migrations/0007_user_mail_preferences.sql?raw";
import userOnboardingMigration from "../../../migrations/0008_user_onboarding.sql?raw";
import loginEmailDomainMigration from "../../../migrations/0009_login_email_domain_isolation.sql?raw";
import deviceAuthorizationMigration from "../../../migrations/0010_oauth_device_authorization.sql?raw";
import latestPasswordResetTokenMigration from "../../../migrations/0011_latest_password_reset_token.sql?raw";
import messageActivityIndexMigration from "../../../migrations/0012_message_activity_index.sql?raw";
import messageChangesMigration from "../../../migrations/0013_message_changes.sql?raw";
import unassignedMessagesMigration from "../../../migrations/0014_unassigned_messages.sql?raw";
import draftChangesMigration from "../../../migrations/0015_draft_changes.sql?raw";
import oneAddressMigration from "../../../migrations/0016_one_address_per_mailbox.sql?raw";
import removeAliasStorageMigration from "../../../migrations-after-deploy/0001_remove_mailbox_alias_storage.sql?raw";
import { migrationStatements } from "./migration-statements";

const priorMigrations = [
  initialMigration,
  workspaceMigration,
  oauthResourcesMigration,
  conversationMigration,
  threadRebuildMigration,
  pushMigration,
  userMailPreferencesMigration,
  userOnboardingMigration,
  loginEmailDomainMigration,
  deviceAuthorizationMigration,
  latestPasswordResetTokenMigration,
  messageActivityIndexMigration,
  messageChangesMigration,
  unassignedMessagesMigration,
  draftChangesMigration
];

const stamp = "2026-08-23T12:00:00.000Z";
const sourceMailboxId = "mbx_alias_migration";
const aliasMailboxId = "mbx_migrated_addr_alias_migration";
const receiveOnlyMailboxId = "mbx_migrated_addr_receive_only_migration";
let messageHighWater = 0;
let draftHighWater = 0;
let compatibilitySnapshot: {
  addressCount: number;
  deliveredAddressIdColumn: number;
  mappingCount: number;
  sentAddressIdColumn: number;
  transitionTriggerCount: number;
} | null = null;
let transitionErrors: string[] = [];

describe("one address per mailbox migration", () => {
  beforeAll(async () => {
    for (const migration of priorMigrations) await applyMigration(migration);
    await insertFixture();
    messageHighWater = await highWater("message_changes");
    draftHighWater = await highWater("draft_changes");
    await applyMigration(oneAddressMigration);
    compatibilitySnapshot = await legacySchemaSnapshot();
    transitionErrors = await blockedTransitionMutations();
    await insertCutoverWindowFixture();
    await applyMigration(removeAliasStorageMigration);
  });

  it("keeps old message writes usable while freezing the legacy configuration", () => {
    expect(compatibilitySnapshot).toEqual({
      addressCount: 3,
      deliveredAddressIdColumn: 1,
      mappingCount: 3,
      sentAddressIdColumn: 1,
      transitionTriggerCount: 11
    });
    expect(transitionErrors).toHaveLength(5);
    for (const message of transitionErrors.slice(0, 4)) {
      expect(message).toContain("mailbox migration is in progress");
    }
    expect(transitionErrors[4]).toContain("mailboxes.mail_domain_id is required");
  });

  it("converts each additional address into a deterministic mailbox", async () => {
    const rows = await env.DB.prepare(
      `SELECT id, address, mail_domain_id, display_name, is_active
       FROM mailboxes WHERE id IN (?, ?, ?) ORDER BY id`
    )
      .bind(sourceMailboxId, aliasMailboxId, receiveOnlyMailboxId)
      .all<{
        id: string;
        address: string;
        mail_domain_id: string;
        display_name: string;
        is_active: number;
      }>();

    expect(rows.results).toEqual([
      {
        id: sourceMailboxId,
        address: "support@example.com",
        mail_domain_id: "dom_alias_primary",
        display_name: "Support",
        is_active: 0
      },
      {
        id: aliasMailboxId,
        address: "help@example.net",
        mail_domain_id: "dom_alias_secondary",
        display_name: "Help",
        is_active: 1
      },
      {
        id: receiveOnlyMailboxId,
        address: "updates@example.net",
        mail_domain_id: "dom_alias_secondary",
        display_name: "Updates",
        is_active: 0
      }
    ]);

    const grants = await env.DB.prepare(
      `SELECT mailbox_id, user_id, access_level, created_by
       FROM mailbox_grants WHERE mailbox_id IN (?, ?) ORDER BY mailbox_id`
    )
      .bind(aliasMailboxId, receiveOnlyMailboxId)
      .all();
    expect(grants.results).toEqual([
      {
        mailbox_id: aliasMailboxId,
        user_id: "usr_alias_migration",
        access_level: "agent",
        created_by: "usr_alias_migration"
      },
      {
        mailbox_id: receiveOnlyMailboxId,
        user_id: "usr_alias_migration",
        access_level: "agent",
        created_by: "usr_alias_migration"
      }
    ]);

    const policies = await env.DB.prepare(
      `SELECT mailbox_id, message_days, trash_days, updated_by
       FROM retention_policies WHERE mailbox_id IN (?, ?) ORDER BY mailbox_id`
    )
      .bind(aliasMailboxId, receiveOnlyMailboxId)
      .all();
    expect(policies.results).toEqual([
      {
        mailbox_id: aliasMailboxId,
        message_days: 90,
        trash_days: 14,
        updated_by: "usr_alias_migration"
      },
      {
        mailbox_id: receiveOnlyMailboxId,
        message_days: 90,
        trash_days: 14,
        updated_by: "usr_alias_migration"
      }
    ]);
  });

  it("moves exact-address mail and drafts without changing threads or attachments", async () => {
    const messages = await env.DB.prepare(
      `SELECT id, thread_id, mailbox_id, delivered_to_address
       FROM messages WHERE id LIKE 'msg_alias_migration_%' ORDER BY id`
    ).all();
    expect(messages.results).toEqual([
      {
        id: "msg_alias_migration_inbound",
        thread_id: "thr_alias_migration",
        mailbox_id: aliasMailboxId,
        delivered_to_address: "help@example.net"
      },
      {
        id: "msg_alias_migration_outbound",
        thread_id: "thr_alias_migration",
        mailbox_id: aliasMailboxId,
        delivered_to_address: null
      },
      {
        id: "msg_alias_migration_primary",
        thread_id: "thr_alias_migration",
        mailbox_id: sourceMailboxId,
        delivered_to_address: "support@example.com"
      }
    ]);

    await expect(
      env.DB.prepare(
        "SELECT message_id, filename, r2_key FROM message_attachments WHERE id = 'att_alias_migration'"
      ).first()
    ).resolves.toEqual({
      message_id: "msg_alias_migration_inbound",
      filename: "invoice.txt",
      r2_key: "messages/alias/invoice.txt"
    });

    const drafts = await env.DB.prepare(
      `SELECT id, mailbox_id, from_address FROM drafts
       WHERE id LIKE 'drf_alias_migration_%' ORDER BY id`
    ).all();
    expect(drafts.results).toEqual([
      {
        id: "drf_alias_migration_alias",
        mailbox_id: aliasMailboxId,
        from_address: "help@example.net"
      },
      {
        id: "drf_alias_migration_primary",
        mailbox_id: sourceMailboxId,
        from_address: "support@example.com"
      }
    ]);
    await expect(
      env.DB.prepare(
        "SELECT draft_id, filename, r2_key FROM draft_attachments WHERE id = 'att_draft_alias_migration'"
      ).first()
    ).resolves.toEqual({
      draft_id: "drf_alias_migration_alias",
      filename: "draft.txt",
      r2_key: "drafts/alias/draft.txt"
    });
  });

  it("captures old Worker mail and draft writes during the deployment window", async () => {
    await expect(
      env.DB.prepare(
        `SELECT id, address, mail_domain_id, is_active
         FROM mailboxes WHERE id = 'mbx_cutover_new_worker'`
      ).first()
    ).resolves.toEqual({
      id: "mbx_cutover_new_worker",
      address: "new-worker@example.net",
      mail_domain_id: "dom_alias_secondary",
      is_active: 1
    });
    await expect(
      env.DB.prepare(
        `SELECT mailbox_id, delivered_to_address
         FROM messages WHERE id = 'msg_cutover_alias_migration'`
      ).first()
    ).resolves.toEqual({
      mailbox_id: aliasMailboxId,
      delivered_to_address: "help@example.net"
    });
    await expect(
      env.DB.prepare(
        `SELECT mailbox_id, from_address
         FROM drafts WHERE id = 'drf_cutover_alias_migration'`
      ).first()
    ).resolves.toEqual({
      mailbox_id: aliasMailboxId,
      from_address: "help@example.net"
    });
  });

  it("keeps defaults, catch-all state, audit history, and durable change journals", async () => {
    await expect(
      env.DB.prepare(
        "SELECT default_from_mailbox_id FROM user_mail_preferences WHERE user_id = 'usr_alias_migration'"
      ).first()
    ).resolves.toEqual({ default_from_mailbox_id: sourceMailboxId });
    await expect(
      env.DB.prepare(
        "SELECT catch_all_mailbox_id FROM mail_domains WHERE id = 'dom_alias_primary'"
      ).first()
    ).resolves.toEqual({ catch_all_mailbox_id: sourceMailboxId });
    await expect(
      env.DB.prepare(
        "SELECT action, resource_id FROM audit_events WHERE id = 'aud_alias_migration'"
      ).first()
    ).resolves.toEqual({ action: "mailbox_address.create", resource_id: sourceMailboxId });

    const messageChanges = await env.DB.prepare(
      `SELECT message_id, mailbox_id, kind FROM message_changes
       WHERE sequence > ? AND mailbox_id = ? ORDER BY sequence`
    )
      .bind(messageHighWater, aliasMailboxId)
      .all();
    expect(messageChanges.results).toEqual([
      {
        message_id: "msg_alias_migration_inbound",
        mailbox_id: aliasMailboxId,
        kind: "upsert"
      },
      {
        message_id: "msg_alias_migration_outbound",
        mailbox_id: aliasMailboxId,
        kind: "upsert"
      },
      {
        message_id: "msg_cutover_alias_migration",
        mailbox_id: aliasMailboxId,
        kind: "upsert"
      }
    ]);

    const draftChanges = await env.DB.prepare(
      `SELECT draft_id, user_id, kind FROM draft_changes
       WHERE sequence > ? ORDER BY sequence`
    )
      .bind(draftHighWater)
      .all();
    expect(draftChanges.results).toEqual([
      {
        draft_id: "drf_alias_migration_alias",
        user_id: "usr_alias_migration",
        kind: "upsert"
      },
      {
        draft_id: "drf_cutover_alias_migration",
        user_id: "usr_alias_migration",
        kind: "upsert"
      },
      {
        draft_id: "drf_cutover_alias_migration",
        user_id: "usr_alias_migration",
        kind: "upsert"
      }
    ]);
  });

  it("removes the alias schema, preserves v1 OAuth data, and leaves valid foreign keys", async () => {
    const tables = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN ('mailbox_addresses', 'mailbox_address_migration')`
    ).all();
    expect(tables.results).toEqual([]);

    const columns = await env.DB.prepare("PRAGMA table_info(messages)").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toContain("delivered_to_address");
    expect(columns.results.map((column) => column.name)).not.toContain("delivered_to_address_id");
    expect(columns.results.map((column) => column.name)).not.toContain("sent_from_address_id");

    await expect(
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM oauthResource
         WHERE identifier = 'https://hqbase.test/api/v1'`
      ).first()
    ).resolves.toEqual({ count: 1 });
    await expect(
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM oauthClientResource
         WHERE clientId = 'legacy_alias_migration'`
      ).first()
    ).resolves.toEqual({ count: 1 });
    await expect(
      env.DB.prepare(
        "SELECT installed_schema_version FROM release_state WHERE singleton = 1"
      ).first()
    ).resolves.toEqual({ installed_schema_version: 3 });

    const foreignKeys = await env.DB.prepare("PRAGMA foreign_key_check").all();
    expect(foreignKeys.results).toEqual([]);
  });
});

async function insertFixture(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, role)
       VALUES ('usr_alias_migration', 'Alias Migration', 'owner@login.example', 1, ?, ?, 'owner')`
    ).bind(stamp, stamp),
    env.DB.prepare(
      `INSERT INTO mail_domains
       (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
       VALUES
         ('dom_alias_primary', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?),
         ('dom_alias_secondary', 'example.net', 'ready', 'ready', 'ready', 1, ?, ?)`
    ).bind(stamp, stamp, stamp, stamp),
    env.DB.prepare(
      `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES (?, 'support@example.com', 'Support', 1, ?, ?)`
    ).bind(sourceMailboxId, stamp, stamp),
    env.DB.prepare(
      `INSERT INTO mailbox_addresses
       (id, mailbox_id, mail_domain_id, local_part, address, display_name,
        receive_enabled, send_enabled, is_primary, created_at, updated_at)
       VALUES
         ('addr_primary_migration', ?, 'dom_alias_primary', 'support', 'support@example.com',
          'Support', 1, 0, 1, ?, ?),
         ('addr_alias_migration', ?, 'dom_alias_secondary', 'help', 'help@example.net',
          'Help', 1, 1, 0, ?, ?),
         ('addr_receive_only_migration', ?, 'dom_alias_secondary', 'updates',
          'updates@example.net', 'Updates', 1, 0, 0, ?, ?)`
    ).bind(
      sourceMailboxId,
      stamp,
      stamp,
      sourceMailboxId,
      stamp,
      stamp,
      sourceMailboxId,
      stamp,
      stamp
    ),
    env.DB.prepare(
      `INSERT INTO mailbox_grants
       (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
       VALUES (?, 'usr_alias_migration', 'agent', 'usr_alias_migration', ?, ?)`
    ).bind(sourceMailboxId, stamp, stamp),
    env.DB.prepare(
      `INSERT INTO retention_policies
       (mailbox_id, message_days, trash_days, updated_by, updated_at)
       VALUES (?, 90, 14, 'usr_alias_migration', ?)`
    ).bind(sourceMailboxId, stamp),
    env.DB.prepare(
      `INSERT INTO user_mail_preferences
       (user_id, default_from_mailbox_id, created_at, updated_at)
       VALUES ('usr_alias_migration', ?, ?, ?)`
    ).bind(sourceMailboxId, stamp, stamp),
    env.DB.prepare(
      `UPDATE mail_domains SET catch_all_policy = 'mailbox', catch_all_mailbox_id = ?
       WHERE id = 'dom_alias_primary'`
    ).bind(sourceMailboxId),
    env.DB.prepare(
      `INSERT INTO audit_events
       (id, occurred_at, correlation_id, actor_type, actor_id, action, resource_type,
        resource_id, outcome, metadata_json)
       VALUES ('aud_alias_migration', ?, 'corr_alias_migration', 'user',
               'usr_alias_migration', 'mailbox_address.create', 'mailbox', ?, 'success', '{}')`
    ).bind(stamp, sourceMailboxId),
    env.DB.prepare(
      `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
       VALUES ('thr_alias_migration', 'alias migration', ?, ?, ?)`
    ).bind(stamp, stamp, stamp),
    messageRow({
      id: "msg_alias_migration_inbound",
      direction: "inbound",
      from: "customer@example.org",
      deliveredToAddressId: "addr_alias_migration"
    }),
    messageRow({
      id: "msg_alias_migration_outbound",
      direction: "outbound",
      from: "help@example.net",
      sentFromAddressId: "addr_alias_migration"
    }),
    messageRow({
      id: "msg_alias_migration_primary",
      direction: "inbound",
      from: "reader@example.org",
      deliveredToAddressId: "addr_primary_migration"
    }),
    env.DB.prepare(
      `INSERT INTO message_attachments
       (id, message_id, filename, content_type, size_bytes, r2_key, created_at)
       VALUES ('att_alias_migration', 'msg_alias_migration_inbound', 'invoice.txt',
               'text/plain', 7, 'messages/alias/invoice.txt', ?)`
    ).bind(stamp),
    draftRow("drf_alias_migration_alias", "help@example.net"),
    draftRow("drf_alias_migration_primary", "support@example.com"),
    env.DB.prepare(
      `INSERT INTO draft_attachments
       (id, draft_id, filename, content_type, size_bytes, r2_key, created_at)
       VALUES ('att_draft_alias_migration', 'drf_alias_migration_alias', 'draft.txt',
               'text/plain', 5, 'drafts/alias/draft.txt', ?)`
    ).bind(stamp)
  ]);
}

async function legacySchemaSnapshot(): Promise<{
  addressCount: number;
  deliveredAddressIdColumn: number;
  mappingCount: number;
  sentAddressIdColumn: number;
  transitionTriggerCount: number;
}> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM mailbox_addresses) AS addressCount,
       (SELECT COUNT(*) FROM mailbox_address_migration) AS mappingCount,
       (SELECT COUNT(*) FROM pragma_table_info('messages')
        WHERE name = 'delivered_to_address_id') AS deliveredAddressIdColumn,
       (SELECT COUNT(*) FROM pragma_table_info('messages')
        WHERE name = 'sent_from_address_id') AS sentAddressIdColumn,
       (SELECT COUNT(*) FROM sqlite_master
        WHERE type = 'trigger' AND name LIKE '%_transition_%') AS transitionTriggerCount`
  ).first<{
    addressCount: number;
    deliveredAddressIdColumn: number;
    mappingCount: number;
    sentAddressIdColumn: number;
    transitionTriggerCount: number;
  }>();
  if (!row) throw new Error("The deployment compatibility schema is missing.");
  return row;
}

async function blockedTransitionMutations(): Promise<string[]> {
  const statements = [
    env.DB.prepare(
      `INSERT INTO mailbox_addresses
       (id, mailbox_id, mail_domain_id, local_part, address, display_name,
        receive_enabled, send_enabled, is_primary, created_at, updated_at)
       VALUES ('addr_blocked_migration', ?, 'dom_alias_secondary', 'blocked',
               'blocked@example.net', 'Blocked', 1, 1, 0, ?, ?)`
    ).bind(sourceMailboxId, stamp, stamp),
    env.DB.prepare(
      `DELETE FROM mailbox_grants
       WHERE mailbox_id = ? AND user_id = 'usr_alias_migration'`
    ).bind(sourceMailboxId),
    env.DB.prepare(`UPDATE retention_policies SET trash_days = 30 WHERE mailbox_id = ?`).bind(
      sourceMailboxId
    ),
    env.DB.prepare(`UPDATE mailboxes SET is_active = 0 WHERE id = ?`).bind(sourceMailboxId),
    env.DB.prepare(
      `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES ('mbx_blocked_old_worker', 'blocked-old@example.net', 'Blocked old', 1, ?, ?)`
    ).bind(stamp, stamp)
  ];
  return Promise.all(
    statements.map(async (statement) => {
      try {
        await statement.run();
        return "mutation unexpectedly succeeded";
      } catch (error) {
        return String(error);
      }
    })
  );
}

async function insertCutoverWindowFixture(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO mailboxes
       (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
       VALUES ('mbx_cutover_new_worker', 'new-worker@example.net', 'dom_alias_secondary',
               'New Worker', 1, ?, ?)`
    ).bind(stamp, stamp),
    env.DB.prepare(
      `INSERT INTO messages
       (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
        subject, snippet, text_body, references_json, received_at, has_attachments,
        created_at, updated_at, delivered_to_address_id)
       VALUES ('msg_cutover_alias_migration', 'thr_alias_migration', ?, 'inbound', 'inbox',
               'cutover-sender@example.org', '["help@example.net"]', '[]', '[]', 'Cutover alias',
               '', '', '[]', ?, 0, ?, ?, 'addr_alias_migration')`
    ).bind(sourceMailboxId, stamp, stamp, stamp),
    draftRow("drf_cutover_alias_migration", "help@example.net"),
    env.DB.prepare(
      `INSERT INTO oauthResource (id, identifier, name, disabled, createdAt, updatedAt)
       VALUES ('resource_alias_migration_v1', 'https://hqbase.test/api/v1',
               'https://hqbase.test/api/v1', 0, ?, ?)`
    ).bind(stamp, stamp),
    env.DB.prepare(
      `INSERT INTO oauthClient (id, clientId, name, redirectUris, createdAt, updatedAt)
       VALUES ('client_alias_migration', 'legacy_alias_migration', 'Legacy client', '[]', ?, ?)`
    ).bind(stamp, stamp),
    env.DB.prepare(
      `INSERT INTO oauthClientResource (id, clientId, resourceId, createdAt)
       VALUES ('client_resource_alias_migration', 'legacy_alias_migration',
               'https://hqbase.test/api/v1', ?)`
    ).bind(stamp)
  ]);
}

function messageRow(input: {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  deliveredToAddressId?: string;
  sentFromAddressId?: string;
}): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO messages
     (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
      subject, snippet, text_body, references_json, received_at, sent_at, read_at,
      has_attachments, created_at, updated_at, delivered_to_address_id, sent_from_address_id)
     VALUES (?, 'thr_alias_migration', ?, ?, ?, ?, '["recipient@example.org"]', '[]', '[]',
             ?, '', '', '[]', ?, ?, ?, 0, ?, ?, ?, ?)`
  ).bind(
    input.id,
    sourceMailboxId,
    input.direction,
    input.direction === "inbound" ? "inbox" : "sent",
    input.from,
    input.id,
    input.direction === "inbound" ? stamp : null,
    input.direction === "outbound" ? stamp : null,
    input.direction === "outbound" ? stamp : null,
    stamp,
    stamp,
    input.deliveredToAddressId ?? null,
    input.sentFromAddressId ?? null
  );
}

function draftRow(id: string, from: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO drafts
     (id, user_id, mailbox_id, from_address, to_json, cc_json, bcc_json, subject,
      text_body, html_body, created_at, updated_at)
     VALUES (?, 'usr_alias_migration', ?, ?, '[]', '[]', '[]', ?, '', '', ?, ?)`
  ).bind(id, sourceMailboxId, from, id, stamp, stamp);
}

async function highWater(table: "message_changes" | "draft_changes"): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(MAX(sequence), 0) AS sequence FROM ${table}`
  ).first<{
    sequence: number;
  }>();
  return row?.sequence ?? 0;
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
