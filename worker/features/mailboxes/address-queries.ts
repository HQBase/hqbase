import { sql } from "drizzle-orm";

import { getRow } from "../../db/drizzle";
import { addressMap, mapMailbox, mapMailboxAddress } from "./queries";
import type { Mailbox, MailboxAddress, MailboxAddressRow } from "./types";

export async function findAddressIdentity(
  db: D1Database,
  address: string,
  capability: "receive" | "send"
): Promise<{ mailbox: Mailbox; address: MailboxAddress } | null> {
  const enabledColumn = capability === "receive" ? "a.receive_enabled" : "a.send_enabled";
  const domainState = capability === "receive" ? "d.receiving_status" : "d.sending_status";
  const row = await getRow<
    MailboxAddressRow & {
      mailbox_address: string;
      mailbox_display_name: string;
      is_active: number;
      created_at: string;
      updated_at: string;
    }
  >(
    db,
    sql`SELECT a.id, a.mailbox_id, a.mail_domain_id, a.address, a.display_name,
            a.receive_enabled, a.send_enabled, a.is_primary, d.sending_status,
            m.address AS mailbox_address, m.display_name AS mailbox_display_name,
            m.is_active, m.created_at, m.updated_at
     FROM mailbox_addresses a
     JOIN mailboxes m ON m.id = a.mailbox_id
     JOIN mail_domains d ON d.id = a.mail_domain_id
     WHERE a.address = ${address.toLowerCase()}
       AND ${sql.raw(enabledColumn)} = 1
       AND d.is_enabled = 1
       AND ${sql.raw(domainState)} = 'ready'
     LIMIT 1`
  );
  if (!row) return null;
  return {
    address: mapMailboxAddress(row),
    mailbox: mapMailbox(
      {
        id: row.mailbox_id,
        address: row.mailbox_address,
        display_name: row.mailbox_display_name,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at
      },
      (await addressMap(db, [row.mailbox_id])).get(row.mailbox_id)
    )
  };
}
