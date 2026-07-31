export async function isPasswordSetupRequired(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT status FROM user_onboarding WHERE user_id = ?")
    .bind(userId)
    .first<{ status: "pending" | "complete" }>();
  return row?.status === "pending";
}

export async function completePasswordSetup(db: D1Database, userId: string): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE user_onboarding
       SET status = 'complete', completed_at = ?, updated_at = ?
       WHERE user_id = ? AND status = 'pending'`
    )
    .bind(timestamp, timestamp, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
