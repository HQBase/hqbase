import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getSetting, setSetting } from "../../db/client";
import { createDatabase, getRow } from "../../db/drizzle";
import { workspaceHosts } from "../../db/schema";
import { listMailDomains } from "../domains/queries";
import { countMailboxes } from "../mailboxes/queries";

import type { SetupStatus } from "./types";

export async function getSetupStatus(db: D1Database): Promise<SetupStatus> {
  const database = createDatabase(db);
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
    database
      .select({ hostname: workspaceHosts.hostname, kind: workspaceHosts.kind })
      .from(workspaceHosts)
      .where(and(eq(workspaceHosts.kind, "portal"), eq(workspaceHosts.isCanonical, true)))
  ]);

  return {
    isComplete: isComplete ?? false,
    primaryDomain,
    portalHostname: hosts.find((host) => host.kind === "portal")?.hostname ?? null,
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
  const database = createDatabase(db);
  const isCanonical = input.kind === "portal" && input.canonical !== false;
  const upsert = database
    .insert(workspaceHosts)
    .values({
      id: `host_${crypto.randomUUID()}`,
      hostname: input.hostname,
      zoneId: input.zoneId ?? null,
      kind: input.kind,
      isCanonical,
      status: "ready",
      verifiedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: workspaceHosts.hostname,
      set: {
        zoneId: input.zoneId ?? null,
        kind: input.kind,
        isCanonical,
        status: "ready",
        verifiedAt: timestamp,
        updatedAt: timestamp
      }
    });
  if (isCanonical) {
    await database.batch([
      database
        .update(workspaceHosts)
        .set({ isCanonical: false })
        .where(eq(workspaceHosts.kind, "portal")),
      upsert
    ]);
    return;
  }
  await upsert.run();
}

export async function countUsers(db: D1Database): Promise<number> {
  const row = await getRow<{ count: number }>(db, sql`SELECT COUNT(*) AS count FROM "user"`);
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
