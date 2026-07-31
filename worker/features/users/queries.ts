import type { WorkspaceRole } from "../../lib/validation";

import type { UserOnboardingMethod, UserRow, WorkspaceUser } from "./types";

export async function listUsers(db: D1Database): Promise<WorkspaceUser[]> {
  const result = await db
    .prepare(
      `SELECT user.id, user.name, user.email, user.role, user.banned, user.createdAt,
              onboarding.method AS onboarding_method,
              onboarding.status AS onboarding_status,
              onboarding.invitation_sent_at
       FROM "user" user
       LEFT JOIN user_onboarding onboarding ON onboarding.user_id = user.id
       ORDER BY user.createdAt ASC`
    )
    .all<UserRow>();

  return result.results.map(mapUser);
}

export async function findWorkspaceUser(
  db: D1Database,
  userId: string
): Promise<WorkspaceUser | null> {
  const row = await db
    .prepare(
      `SELECT user.id, user.name, user.email, user.role, user.banned, user.createdAt,
              onboarding.method AS onboarding_method,
              onboarding.status AS onboarding_status,
              onboarding.invitation_sent_at
       FROM "user" user
       LEFT JOIN user_onboarding onboarding ON onboarding.user_id = user.id
       WHERE user.id = ?`
    )
    .bind(userId)
    .first<UserRow>();
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
  await db
    .prepare(
      `INSERT INTO user_onboarding
       (user_id, method, status, created_by, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?)`
    )
    .bind(input.userId, input.method, input.createdBy, timestamp, timestamp)
    .run();
}

export async function clearInvitationSentAt(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE user_onboarding SET invitation_sent_at = NULL, updated_at = ?
         WHERE user_id = ? AND method = 'email_invite' AND status = 'pending'`
      )
      .bind(new Date().toISOString(), userId),
    db
      .prepare(
        `DELETE FROM verification
         WHERE value = ? AND identifier LIKE 'reset-password:%'`
      )
      .bind(userId)
  ]);
}

export async function setWorkspaceUserRole(
  db: D1Database,
  userId: string,
  role: WorkspaceRole
): Promise<void> {
  await db
    .prepare('UPDATE "user" SET role = ?, updatedAt = ? WHERE id = ?')
    .bind(role, new Date().toISOString(), userId)
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
