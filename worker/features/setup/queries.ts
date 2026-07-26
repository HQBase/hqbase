import { z } from "zod";

import { getSetting, setSetting } from "../../db/client";
import { listMailDomains } from "../domains/queries";
import { countMailboxes } from "../mailboxes/queries";

import type { SetupStatus } from "./types";

export async function getSetupStatus(db: D1Database): Promise<SetupStatus> {
  const [
    primaryDomain,
    isComplete,
    checklistAcknowledged,
    userCount,
    mailboxCount,
    domains,
    hosts
  ] = await Promise.all([
    getSetting(db, "primary_domain", z.string()),
    getSetting(db, "setup_complete", z.boolean()),
    getSetting(db, "setup_checklist_acknowledged", z.boolean()),
    countUsers(db),
    countMailboxes(db),
    listMailDomains(db),
    db
      .prepare(
        `SELECT hostname, kind FROM workspace_hosts
         WHERE kind = 'portal' AND is_canonical = 1`
      )
      .all<{ hostname: string; kind: "portal" }>()
  ]);

  return {
    isComplete: isComplete ?? false,
    primaryDomain,
    portalHostname: hosts.results.find((host) => host.kind === "portal")?.hostname ?? null,
    domains,
    userCount,
    mailboxCount,
    checklistAcknowledged: checklistAcknowledged ?? false
  };
}

export async function upsertWorkspaceHost(
  db: D1Database,
  input: {
    hostname: string;
    zoneId?: string | null;
    kind: "portal";
    canonical?: boolean;
  }
): Promise<void> {
  const timestamp = new Date().toISOString();
  if (input.kind === "portal" && input.canonical !== false) {
    await db.prepare("UPDATE workspace_hosts SET is_canonical = 0 WHERE kind = 'portal'").run();
  }
  await db
    .prepare(
      `INSERT INTO workspace_hosts
     (id, hostname, zone_id, kind, is_canonical, status, verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?)
     ON CONFLICT(hostname) DO UPDATE SET zone_id = excluded.zone_id, kind = excluded.kind,
       is_canonical = excluded.is_canonical, status = 'ready', verified_at = excluded.verified_at,
       updated_at = excluded.updated_at`
    )
    .bind(
      `host_${crypto.randomUUID()}`,
      input.hostname,
      input.zoneId ?? null,
      input.kind,
      input.kind === "portal" && input.canonical !== false ? 1 : 0,
      timestamp,
      timestamp,
      timestamp
    )
    .run();
}

export async function countUsers(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM "user"').first<{ count: number }>();
  return row?.count ?? 0;
}

export async function setPrimaryDomain(db: D1Database, primaryDomain: string): Promise<void> {
  await setSetting(db, "primary_domain", primaryDomain);
}

export async function setChecklistAcknowledged(
  db: D1Database,
  acknowledged: boolean
): Promise<void> {
  await setSetting(db, "setup_checklist_acknowledged", acknowledged);
}

export async function setSetupComplete(db: D1Database, complete: boolean): Promise<void> {
  await setSetting(db, "setup_complete", complete);
}
