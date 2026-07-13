import { z } from "zod";

import { getSetting, setSetting } from "../../db/client";
import { countMailboxes } from "../mailboxes/queries";

import type { SetupStatus } from "./types";

export async function getSetupStatus(db: D1Database): Promise<SetupStatus> {
  const [primaryDomain, isComplete, checklistAcknowledged, userCount, mailboxCount] =
    await Promise.all([
      getSetting(db, "primary_domain", z.string()),
      getSetting(db, "setup_complete", z.boolean()),
      getSetting(db, "setup_checklist_acknowledged", z.boolean()),
      countUsers(db),
      countMailboxes(db)
    ]);

  return {
    isComplete: isComplete ?? false,
    primaryDomain,
    userCount,
    mailboxCount,
    checklistAcknowledged: checklistAcknowledged ?? false
  };
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
