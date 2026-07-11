import type { WorkspaceRole } from "../../lib/validation";

import type { UserRow, WorkspaceUser } from "./types";

export async function listUsers(db: D1Database): Promise<WorkspaceUser[]> {
  const result = await db
    .prepare('SELECT id, name, email, role, banned, createdAt FROM "user" ORDER BY createdAt ASC')
    .all<UserRow>();

  return result.results.map(mapUser);
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
    createdAt: row.createdAt
  };
}
