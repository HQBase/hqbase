import { and, eq, like, sql } from "drizzle-orm";

import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { userOnboarding, users, verifications } from "../../db/schema";
import type { WorkspaceRole } from "../../lib/validation";

import type { UserOnboardingMethod, UserRow, WorkspaceUser } from "./types";

export async function listUsers(db: D1Database): Promise<WorkspaceUser[]> {
  const rows = await getRows<UserRow>(
    db,
    sql`SELECT user.id, user.name, user.email, user.role, user.banned, user.createdAt,
              onboarding.method AS onboarding_method,
              onboarding.status AS onboarding_status,
              onboarding.invitation_sent_at
       FROM "user" user
       LEFT JOIN user_onboarding onboarding ON onboarding.user_id = user.id
       ORDER BY user.createdAt ASC`
  );

  return rows.map(mapUser);
}

export async function findWorkspaceUser(
  db: D1Database,
  userId: string
): Promise<WorkspaceUser | null> {
  const row = await getRow<UserRow>(
    db,
    sql`SELECT user.id, user.name, user.email, user.role, user.banned, user.createdAt,
              onboarding.method AS onboarding_method,
              onboarding.status AS onboarding_status,
              onboarding.invitation_sent_at
       FROM "user" user
       LEFT JOIN user_onboarding onboarding ON onboarding.user_id = user.id
       WHERE user.id = ${userId}`
  );
  return row ? mapUser(row) : null;
}

export async function createUserOnboarding(
  db: D1Database,
  input: {
    userId: string;
    method: UserOnboardingMethod;
    createdBy: string;
  }
): Promise<void> {
  const timestamp = new Date().toISOString();
  await createDatabase(db)
    .insert(userOnboarding)
    .values({
      userId: input.userId,
      method: input.method,
      status: "pending",
      createdBy: input.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .run();
}

export async function clearInvitationSentAt(db: D1Database, userId: string): Promise<void> {
  const database = createDatabase(db);
  await database.batch([
    database
      .update(userOnboarding)
      .set({ invitationSentAt: null, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(userOnboarding.userId, userId),
          eq(userOnboarding.method, "email_invite"),
          eq(userOnboarding.status, "pending")
        )
      ),
    database
      .delete(verifications)
      .where(
        and(eq(verifications.value, userId), like(verifications.identifier, "reset-password:%"))
      )
  ]);
}

export async function setWorkspaceUserRole(
  db: D1Database,
  userId: string,
  role: WorkspaceRole
): Promise<void> {
  await createDatabase(db)
    .update(users)
    .set({ role, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();
}

function mapUser(row: UserRow): WorkspaceUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role ?? "member",
    banned: row.banned === 1,
    createdAt: row.createdAt,
    onboardingMethod: row.onboarding_method,
    passwordSetupRequired: row.onboarding_status === "pending",
    invitationSentAt: row.invitation_sent_at
  };
}
