import { and, eq, sql } from "drizzle-orm";

import type { MessageScope } from "../../auth/mailbox-access";
import { messageScopeCondition } from "../../auth/mailbox-access";
import { nowIso } from "../../db/client";
import { createDatabase, getRows } from "../../db/drizzle";
import { contacts } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { listConversationPage } from "../messages/conversation-queries";
import { literalSearchPattern } from "../messages/search";
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

export type ContactDetail = ContactSummary & { notes: string };

type ContactRow = {
  email: string;
  last_contact_at: string | null;
  mailbox_name: string | null;
  name: string | null;
  notes: string | null;
  saved: number;
  source: ContactSource;
};

export async function listContacts(
  db: D1Database,
  input: {
    limit: number;
    scope: MessageScope;
    search?: string | undefined;
    userId: string;
  }
): Promise<ContactSummary[]> {
  const rows = await contactRows(db, input);
  return rows.map(contactSummary);
}

export async function getContactDetail(
  db: D1Database,
  input: { email: string; scope: MessageScope; userId: string }
): Promise<{ contact: ContactDetail; conversations: ConversationSummary[] }> {
  const rows = await contactRows(db, {
    exactEmail: input.email,
    limit: 1,
    scope: input.scope,
    userId: input.userId
  });
  const row = rows.find((candidate) => candidate.email.toLowerCase() === input.email);
  if (!row) throw new AppError("CONTACT_NOT_FOUND", "Contact not found.", 404);

  const page = await listConversationPage(db, {
    correspondentEmail: input.email,
    limit: 50,
    scope: input.scope
  });
  return {
    contact: { ...contactSummary(row), notes: row.notes ?? "" },
    conversations: page.conversations
  };
}

export async function saveContact(
  db: D1Database,
  input: {
    email: string;
    name: string | null;
    notes: string;
    previousEmail: string;
    userId: string;
  }
): Promise<void> {
  const timestamp = nowIso();
  const database = createDatabase(db);
  if (input.previousEmail !== input.email) {
    await database
      .delete(contacts)
      .where(and(eq(contacts.userId, input.userId), eq(contacts.email, input.previousEmail)))
      .run();
  }
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
    limit: number;
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
  const contains = search ? literalSearchPattern(search) : null;
  const prefix = search ? literalSearchPattern(search).slice(1) : null;
  const filter = input.exactEmail
    ? sql`WHERE known.email = ${input.exactEmail}`
    : search
      ? sql`WHERE known.email LIKE ${contains} ESCAPE '\\'
            OR contact.name LIKE ${contains} ESCAPE '\\'
            OR known.mailbox_name LIKE ${contains} ESCAPE '\\'`
      : sql``;
  const rank = search
    ? sql`CASE
        WHEN known.saved = 1 AND (
          known.email LIKE ${prefix} ESCAPE '\\' OR contact.name LIKE ${prefix} ESCAPE '\\'
        ) THEN 0
        WHEN known.email LIKE ${prefix} ESCAPE '\\'
          OR contact.name LIKE ${prefix} ESCAPE '\\'
          OR known.mailbox_name LIKE ${prefix} ESCAPE '\\' THEN 1
        WHEN known.saved = 1 THEN 2
        WHEN known.source = 'mailbox' THEN 3
        ELSE 4
      END`
    : sql`CASE known.source WHEN 'saved' THEN 0 WHEN 'mailbox' THEN 1 ELSE 2 END`;

  return getRows<ContactRow>(
    db,
    sql`WITH accessible_messages AS (
          SELECT message.from_address, message.to_json, message.cc_json, message.bcc_json,
            COALESCE(message.received_at, message.sent_at, message.created_at) AS activity_at
          FROM messages message
          WHERE ${scope}
        ),
        correspondent_events(email, activity_at) AS (
          SELECT lower(trim(from_address)), activity_at FROM accessible_messages
          UNION ALL
          SELECT lower(trim(CAST(recipient.value AS TEXT))), message.activity_at
          FROM accessible_messages message, json_each(message.to_json) recipient
          UNION ALL
          SELECT lower(trim(CAST(recipient.value AS TEXT))), message.activity_at
          FROM accessible_messages message, json_each(message.cc_json) recipient
          UNION ALL
          SELECT lower(trim(CAST(recipient.value AS TEXT))), message.activity_at
          FROM accessible_messages message, json_each(message.bcc_json) recipient
        ),
        recent AS (
          SELECT email, MAX(activity_at) AS last_contact_at
          FROM correspondent_events
          WHERE length(email) BETWEEN 3 AND 254 AND instr(email, '@') > 1
          GROUP BY email
        ),
        available_mailboxes AS (
          SELECT lower(mailbox.address) AS email, mailbox.display_name AS mailbox_name
          FROM mailboxes mailbox
          WHERE ${mailboxScope} AND mailbox.deleted_at IS NULL
        ),
        known_addresses AS (
          SELECT lower(saved.email) AS email, 1 AS saved, 'saved' AS source,
            recent.last_contact_at, mailbox.mailbox_name
          FROM contacts saved
          LEFT JOIN recent ON recent.email = saved.email
          LEFT JOIN available_mailboxes mailbox ON mailbox.email = saved.email
          WHERE saved.user_id = ${input.userId}
          UNION ALL
          SELECT recent.email, 0,
            CASE WHEN mailbox.email IS NOT NULL THEN 'mailbox' ELSE 'recent' END,
            recent.last_contact_at, mailbox.mailbox_name
          FROM recent
          LEFT JOIN available_mailboxes mailbox ON mailbox.email = recent.email
          WHERE NOT EXISTS (
            SELECT 1 FROM contacts saved
            WHERE saved.user_id = ${input.userId} AND saved.email = recent.email
          )
          UNION ALL
          SELECT mailbox.email, 0, 'mailbox', NULL, mailbox.mailbox_name
          FROM available_mailboxes mailbox
          WHERE NOT EXISTS (SELECT 1 FROM recent WHERE recent.email = mailbox.email)
            AND NOT EXISTS (
              SELECT 1 FROM contacts saved
              WHERE saved.user_id = ${input.userId} AND saved.email = mailbox.email
            )
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
          known.mailbox_name, contact.name, contact.notes
        FROM known
        LEFT JOIN contacts contact
          ON contact.user_id = ${input.userId} AND contact.email = known.email
        ${filter}
        ORDER BY ${rank}, known.last_contact_at DESC, known.email ASC
        LIMIT ${input.limit}`
  );
}

function contactSummary(row: ContactRow): ContactSummary {
  return {
    email: row.email,
    id: row.email,
    lastContactAt: row.last_contact_at,
    name: row.name ?? row.mailbox_name,
    saved: row.saved === 1,
    source: row.source
  };
}
