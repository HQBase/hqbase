import { sql } from "drizzle-orm";

import type { MailboxAccessLevel } from "../../auth/mailbox-access";
import { getRow, getRows } from "../../db/drizzle";

import type { Agent, AgentProfile } from "./types";

type AgentRow = {
  id: string;
  name: string;
  status: "active" | "disabled";
  profile: AgentProfile;
  mail_domain_id: string;
  mailbox_limit: number | null;
  mailbox_count: number;
  domain_name: string;
  mailbox_id: string | null;
  mailbox_address: string | null;
  mailbox_display_name: string | null;
  mailbox_deleted_at: string | null;
  access_level: MailboxAccessLevel | null;
  created_at: string;
  updated_at: string;
};

const agentSelect = sql`
  SELECT p.id, p.name, p.status, a.profile, a.mail_domain_id, a.mailbox_limit,
         a.created_at, a.updated_at, d.name AS domain_name,
         g.mailbox_id, g.access_level,
         m.address AS mailbox_address, m.display_name AS mailbox_display_name,
         m.deleted_at AS mailbox_deleted_at,
         (SELECT COUNT(DISTINCT child.principal_id)
          FROM agents child
          JOIN mailbox_grants child_grant ON child_grant.principal_id = child.principal_id
          JOIN mailboxes child_mailbox
            ON child_mailbox.id = child_grant.mailbox_id
           AND child_mailbox.kind = 'agent'
           AND child_mailbox.deleted_at IS NULL
           AND child_mailbox.created_at = child.created_at
          WHERE child.created_by_principal_id = p.id
            AND child.profile = 'mailbox') AS mailbox_count
  FROM agents a
  JOIN principals p ON p.id = a.principal_id AND p.type = 'agent'
  JOIN mail_domains d ON d.id = a.mail_domain_id
  LEFT JOIN mailbox_grants g
    ON g.principal_id = p.id
   AND g.mailbox_id = (
     SELECT first_grant.mailbox_id
     FROM mailbox_grants first_grant
     WHERE first_grant.principal_id = p.id
     ORDER BY first_grant.created_at, first_grant.mailbox_id
     LIMIT 1
   )
  LEFT JOIN mailboxes m ON m.id = g.mailbox_id`;

function mapAgent(row: AgentRow): Agent {
  const agent: Agent = {
    id: row.id,
    name: row.name,
    profile: row.profile,
    isActive: row.status === "active",
    mailDomain: { id: row.mail_domain_id, domain: row.domain_name },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (row.profile === "mailbox") {
    if (row.access_level === "read" || row.access_level === "agent") {
      agent.accessLevel = row.access_level;
    }
    if (row.mailbox_id && row.mailbox_address && row.mailbox_display_name) {
      agent.mailbox = {
        id: row.mailbox_id,
        address: row.mailbox_address,
        displayName: row.mailbox_display_name,
        isDeleted: row.mailbox_deleted_at !== null
      };
    }
  } else {
    agent.mailboxLimit = row.mailbox_limit ?? 0;
    agent.mailboxCount = row.mailbox_count;
  }
  return agent;
}

export async function listAgents(db: D1Database): Promise<Agent[]> {
  const rows = await getRows<AgentRow>(
    db,
    sql`${agentSelect} ORDER BY a.created_at DESC, p.id DESC`
  );
  return rows.map(mapAgent);
}

export async function listAgentsCreatedBy(
  db: D1Database,
  creatorPrincipalId: string
): Promise<Agent[]> {
  const rows = await getRows<AgentRow>(
    db,
    sql`${agentSelect}
        WHERE a.created_by_principal_id = ${creatorPrincipalId} AND a.profile = 'mailbox'
        ORDER BY a.created_at DESC, p.id DESC`
  );
  return rows.map(mapAgent);
}

export async function findAgentById(db: D1Database, id: string): Promise<Agent | null> {
  const row = await getRow<AgentRow>(db, sql`${agentSelect} WHERE p.id = ${id} LIMIT 1`);
  return row ? mapAgent(row) : null;
}
