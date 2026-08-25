import { sql } from "drizzle-orm";

import type { MessageScope } from "../../auth/mailbox-access";
import { messageScopeCondition } from "../../auth/mailbox-access";
import { nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { contacts } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { listConversationPage } from "../messages/conversation-queries";
import { literalContains, literalStartsWith } from "../messages/search";
import type { ConversationSummary } from "../messages/types";

export type ContactSource = "mailbox" | "recent" | "saved";

export type ContactSummary = {
  email: string;
  id: string;
  lastContactAt: string | null;
  name: string | null;
  saved: boolean;
  source: ContactSource;
};

export type ContactDetail = ContactSummary & { notes: string; savedName: string | null };

type ContactRow = {
  email: string;
  last_contact_at: string | null;
  mailbox_name: string | null;
  observed_name: string | null;
  notes: string | null;
  saved_name: string | null;
  saved: number;
  source: ContactSource;
};

export async function listContacts(
  db: D1Database,
  input: {
    limit: number;
    offset?: number | undefined;
    scope: MessageScope;
    search?: string | undefined;
    userId: string;
  }
): Promise<ContactSummary[]> {
  const rows = await contactRows(db, { ...input, includeMailboxSuggestions: false });
  return rows.map(contactSummary);
}

export async function listRecipientSuggestions(
  db: D1Database,
  input: {
    limit: number;
    scope: MessageScope;
    search?: string | undefined;
    userId: string;
  }
): Promise<ContactSummary[]> {
  const rows = await contactRows(db, { ...input, includeMailboxSuggestions: true });
  return rows.map(contactSummary);
}

export async function getContactDetail(
  db: D1Database,
  input: {
    cursor?: string | undefined;
    email: string;
    limit?: number | undefined;
    scope: MessageScope;
    userId: string;
  }
): Promise<{
  contact: ContactDetail;
  conversations: ConversationSummary[];
  nextCursor: string | null;
}> {
  const rows = await contactRows(db, {
    exactEmail: input.email,
    includeMailboxSuggestions: false,
    limit: 1,
    scope: input.scope,
    userId: input.userId
  });
  const row = rows.find((candidate) => candidate.email.toLowerCase() === input.email);
  if (!row) throw new AppError("CONTACT_NOT_FOUND", "Contact not found.", 404);

  const page = await listConversationPage(db, {
    correspondentEmail: input.email,
    cursor: input.cursor,
    limit: input.limit ?? 50,
    scope: input.scope
  });
  return {
    contact: {
      ...contactSummary(row),
      notes: row.notes ?? "",
      savedName: row.saved_name
    },
    conversations: page.conversations,
    nextCursor: page.nextCursor
  };
}

export async function saveContact(
  db: D1Database,
  input: {
    email: string;
    name: string | null;
    notes: string;
    userId: string;
  }
): Promise<void> {
  if (await isWorkspaceMailboxAddress(db, input.email)) {
    throw new AppError("CONTACT_INVALID", "A workspace mailbox cannot be saved as a contact.", 400);
  }
  const timestamp = nowIso();
  const database = createDatabase(db);
  await database
    .insert(contacts)
    .values({
      createdAt: timestamp,
      email: input.email,
      name: input.name,
      notes: input.notes,
      updatedAt: timestamp,
      userId: input.userId
    })
    .onConflictDoUpdate({
      target: [contacts.userId, contacts.email],
      set: { name: input.name, notes: input.notes, updatedAt: timestamp }
    })
    .run();
}

export async function deleteSavedContact(
  db: D1Database,
  userId: string,
  email: string
): Promise<void> {
  const result = await createDatabase(db)
    .delete(contacts)
    .where(sql`${contacts.userId} = ${userId} AND ${contacts.email} = ${email}`)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new AppError("CONTACT_NOT_FOUND", "Saved contact not found.", 404);
  }
}

async function contactRows(
  db: D1Database,
  input: {
    exactEmail?: string | undefined;
    includeMailboxSuggestions: boolean;
    limit: number;
    offset?: number | undefined;
    scope: MessageScope;
    search?: string | undefined;
    userId: string;
  }
): Promise<ContactRow[]> {
  const scope =
    messageScopeCondition(input.scope, "message.mailbox_id", "message.is_unassigned") ?? sql`0`;
  const mailboxScope =
    input.scope.mailboxIds.length > 0
      ? sql`mailbox.id IN (${sql.join(
          input.scope.mailboxIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql`0`;
  const search = input.search?.trim();
  const effectiveName = sql`CASE WHEN known.source = 'mailbox' THEN known.mailbox_name
    ELSE COALESCE(contact.name, observed.observed_name) END`;
  const filter = input.exactEmail
    ? sql`WHERE known.email = ${input.exactEmail}`
    : search
      ? sql`WHERE ${literalContains(sql`known.email`, search)}
            OR ${literalContains(effectiveName, search)}`
      : sql``;
  const rank = search
    ? sql`CASE
        WHEN known.saved = 1 AND (
          ${literalStartsWith(sql`known.email`, search)}
          OR ${literalStartsWith(effectiveName, search)}
        ) THEN 0
        WHEN ${literalStartsWith(sql`known.email`, search)}
          OR ${literalStartsWith(effectiveName, search)} THEN 1
        WHEN known.saved = 1 THEN 2
        WHEN known.source = 'mailbox' THEN 3
        ELSE 4
      END`
    : sql`CASE known.source WHEN 'saved' THEN 0 WHEN 'mailbox' THEN 1 ELSE 2 END`;

  return getRows<ContactRow>(
    db,
    sql`WITH accessible_messages AS (
          SELECT message.to_json, message.cc_json, message.bcc_json,
            COALESCE(message.received_at, message.sent_at, message.created_at) AS activity_at
          FROM messages message
          WHERE ${scope} AND message.direction = 'outbound'
        ),
        correspondent_events(email, activity_at) AS (
          SELECT lower(trim(CAST(recipient.value AS TEXT))), message.activity_at
          FROM accessible_messages message, json_each(message.to_json) recipient
          UNION ALL
          SELECT lower(trim(CAST(recipient.value AS TEXT))), message.activity_at
          FROM accessible_messages message, json_each(message.cc_json) recipient
          UNION ALL
          SELECT lower(trim(CAST(recipient.value AS TEXT))), message.activity_at
          FROM accessible_messages message, json_each(message.bcc_json) recipient
        ),
        workspace_mailboxes AS (
          SELECT lower(mailbox.address) AS email
          FROM mailboxes mailbox
          WHERE mailbox.deleted_at IS NULL
        ),
        observed_sender_candidates AS (
          SELECT lower(trim(message.from_address)) AS email,
            message.from_name AS observed_name,
            ROW_NUMBER() OVER (
              PARTITION BY lower(trim(message.from_address))
              ORDER BY COALESCE(message.received_at, message.sent_at, message.created_at) DESC,
                message.id DESC
            ) AS sender_position
          FROM messages message
          WHERE ${scope} AND message.direction = 'inbound'
            AND message.from_name IS NOT NULL AND trim(message.from_name) <> ''
        ),
        observed_sender_names AS (
          SELECT email, observed_name
          FROM observed_sender_candidates
          WHERE sender_position = 1
        ),
        recent AS (
          SELECT email, MAX(activity_at) AS last_contact_at
          FROM correspondent_events
          WHERE length(email) BETWEEN 3 AND 254 AND instr(email, '@') > 1
            AND NOT EXISTS (
              SELECT 1 FROM workspace_mailboxes mailbox
              WHERE mailbox.email = correspondent_events.email
            )
          GROUP BY email
        ),
        available_mailboxes AS (
          SELECT lower(mailbox.address) AS email, mailbox.display_name AS mailbox_name
          FROM mailboxes mailbox
          WHERE ${mailboxScope} AND mailbox.deleted_at IS NULL
        ),
        known_addresses AS (
          SELECT lower(saved.email) AS email, 1 AS saved, 'saved' AS source,
            recent.last_contact_at, NULL AS mailbox_name
          FROM contacts saved
          LEFT JOIN recent ON recent.email = saved.email
          WHERE saved.user_id = ${input.userId}
            AND NOT EXISTS (
              SELECT 1 FROM workspace_mailboxes mailbox
              WHERE mailbox.email = lower(saved.email)
            )
          UNION ALL
          SELECT recent.email, 0, 'recent', recent.last_contact_at, NULL
          FROM recent
          WHERE NOT EXISTS (
            SELECT 1 FROM contacts saved
            WHERE saved.user_id = ${input.userId} AND saved.email = recent.email
          )
          UNION ALL
          SELECT mailbox.email, 0, 'mailbox', NULL, mailbox.mailbox_name
          FROM available_mailboxes mailbox
          WHERE ${input.includeMailboxSuggestions ? 1 : 0} = 1
        ),
        known AS (
          SELECT email, MAX(saved) AS saved,
            CASE WHEN MAX(saved) = 1 THEN 'saved'
                 WHEN MAX(CASE WHEN source = 'mailbox' THEN 1 ELSE 0 END) = 1 THEN 'mailbox'
                 ELSE 'recent' END AS source,
            MAX(last_contact_at) AS last_contact_at,
            MAX(mailbox_name) AS mailbox_name
          FROM known_addresses
          GROUP BY email
        )
        SELECT known.email, known.saved, known.source, known.last_contact_at,
          known.mailbox_name, contact.name AS saved_name, contact.notes,
          observed.observed_name
        FROM known
        LEFT JOIN contacts contact
          ON contact.user_id = ${input.userId} AND contact.email = known.email
        LEFT JOIN observed_sender_names observed ON observed.email = known.email
        ${filter}
        ORDER BY ${rank}, known.last_contact_at DESC, known.email ASC
        LIMIT ${input.limit} OFFSET ${input.offset ?? 0}`
  );
}

async function isWorkspaceMailboxAddress(db: D1Database, email: string): Promise<boolean> {
  const row = await getRow<{ found: number }>(
    db,
    sql`SELECT 1 AS found FROM mailboxes
        WHERE lower(address) = ${email} AND deleted_at IS NULL
        LIMIT 1`
  );
  return row !== null;
}

function contactSummary(row: ContactRow): ContactSummary {
  return {
    email: row.email,
    id: row.email,
    lastContactAt: row.last_contact_at,
    name:
      row.source === "mailbox"
        ? row.mailbox_name
        : (row.saved_name ?? row.observed_name ?? row.mailbox_name),
    saved: row.saved === 1,
    source: row.source
  };
}
