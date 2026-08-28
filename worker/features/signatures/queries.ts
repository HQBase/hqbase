import { sql } from "drizzle-orm";

import { getRow, getRows } from "../../db/drizzle";
import type { Signature, SignatureRow, SignatureScope } from "./types";

const signatureSelect = sql.raw(`
  SELECT signature.*,
         mailbox.address AS mailbox_address,
         mailbox.display_name AS mailbox_display_name,
         domain.name AS domain_name
  FROM email_signatures signature
  LEFT JOIN mailboxes mailbox ON mailbox.id = signature.mailbox_id
  LEFT JOIN mail_domains domain ON domain.id = signature.mail_domain_id
`);

export async function findSignature(db: D1Database, id: string): Promise<Signature | null> {
  const row = await getRow<SignatureRow>(
    db,
    sql`${signatureSelect} WHERE signature.id = ${id} LIMIT 1`
  );
  return row ? mapSignature(row) : null;
}

export async function listCandidateSignatures(
  db: D1Database,
  input: { userId: string | null; mailboxId: string; mailDomainId: string }
): Promise<Signature[]> {
  const rows = await getRows<SignatureRow>(
    db,
    sql`${signatureSelect}
        WHERE (${input.userId} IS NOT NULL AND signature.user_id = ${input.userId})
           OR signature.mailbox_id = ${input.mailboxId}
           OR signature.mail_domain_id = ${input.mailDomainId}
        ORDER BY CASE
                   WHEN signature.user_id IS NOT NULL THEN 0
                   WHEN signature.mailbox_id IS NOT NULL THEN 1
                   ELSE 2
                 END,
                 signature.is_default DESC,
                 signature.name COLLATE NOCASE,
                 signature.id`
  );
  return rows.map(mapSignature);
}

export async function listManagedSignatures(
  db: D1Database,
  input: { userId: string; mailboxIds: string[]; includeDomains: boolean }
): Promise<Signature[]> {
  const conditions = [sql`signature.user_id = ${input.userId}`];
  if (input.mailboxIds.length > 0) {
    conditions.push(
      sql`signature.mailbox_id IN (${sql.join(
        input.mailboxIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    );
  }
  if (input.includeDomains) conditions.push(sql`signature.mail_domain_id IS NOT NULL`);
  const rows = await getRows<SignatureRow>(
    db,
    sql`${signatureSelect}
        WHERE ${sql.join(conditions, sql` OR `)}
        ORDER BY CASE
                   WHEN signature.user_id IS NOT NULL THEN 0
                   WHEN signature.mailbox_id IS NOT NULL THEN 1
                   ELSE 2
                 END,
                 signature.is_default DESC,
                 signature.name COLLATE NOCASE,
                 signature.id`
  );
  return rows.map(mapSignature);
}

function mapSignature(row: SignatureRow): Signature {
  const scope: SignatureScope = row.user_id ? "user" : row.mailbox_id ? "mailbox" : "domain";
  const scopeId = row.user_id ?? row.mailbox_id ?? row.mail_domain_id;
  if (!scopeId) throw new Error("Signature has no scope.");
  return {
    id: row.id,
    name: row.name,
    html: row.html_body,
    text: row.text_body,
    scope,
    scopeId,
    scopeLabel:
      scope === "user"
        ? "Personal"
        : scope === "mailbox"
          ? [row.mailbox_display_name, row.mailbox_address].filter(Boolean).join(" · ")
          : (row.domain_name ?? "Domain"),
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
