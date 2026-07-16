import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { cloudflare } from "./cloudflare";
import { getUpgrade, transitionUpgrade } from "./queries";
import type { UpgradeRecord } from "./types";

type ExportResult = {
  at_bookmark?: string;
  status?: "complete" | "error";
  error?: string;
  result?: { filename?: string; signed_url?: string };
};

export async function advanceWorkspaceBackup(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<UpgradeRecord> {
  if (!upgrade.accountId || !upgrade.d1DatabaseId || !upgrade.r2BucketName) {
    throw new AppError(
      "UPGRADE_TARGET_INCOMPLETE",
      "The verified installation inventory is incomplete.",
      409
    );
  }
  await verifyBoundMailObjects(env);
  const path = `/accounts/${upgrade.accountId}/d1/database/${upgrade.d1DatabaseId}/export`;
  const result = await cloudflare<ExportResult>(
    token,
    path,
    {
      method: "POST",
      body: JSON.stringify(
        upgrade.checkpointBookmark
          ? { output_format: "polling", current_bookmark: upgrade.checkpointBookmark }
          : { output_format: "polling" }
      )
    },
    fetcher
  );
  const bookmark = upgrade.checkpointBookmark ?? result.at_bookmark;
  if (!bookmark) {
    throw new AppError(
      "UPGRADE_BACKUP_BOOKMARK_MISSING",
      "Cloudflare did not return a D1 backup bookmark.",
      502
    );
  }
  if (!upgrade.checkpointBookmark) {
    await env.DB.prepare(
      `UPDATE community_pro_upgrades
       SET checkpoint_bookmark = ?, updated_at = datetime('now')
       WHERE id = ? AND state = 'target_verified'`
    )
      .bind(bookmark, upgrade.id)
      .run();
  }
  if (result.status === "error") {
    throw new AppError(
      "UPGRADE_BACKUP_FAILED",
      "Cloudflare could not export the Community database.",
      502
    );
  }
  const signedUrl = result.result?.signed_url;
  if (!signedUrl) {
    const pending = await getUpgrade(env.DB, upgrade.id);
    if (!pending) throw new Error("Upgrade record disappeared.");
    return pending;
  }
  const dump = await fetcher(signedUrl, { headers: { accept: "application/sql" } });
  if (!dump.ok || !dump.body) {
    throw new AppError(
      "UPGRADE_BACKUP_DOWNLOAD_FAILED",
      "The D1 backup could not be downloaded.",
      502
    );
  }
  const key = `_hqbase/backups/community-to-pro-${upgrade.id}.sql`;
  await env.MAIL_OBJECTS.put(key, dump.body, {
    httpMetadata: { contentType: "application/sql" },
    customMetadata: { hqbaseUpgradeId: upgrade.id, installationId: upgrade.installationId }
  });
  const object = await env.MAIL_OBJECTS.head(key);
  if (!object || object.size <= 0) {
    throw new AppError(
      "UPGRADE_BACKUP_VERIFY_FAILED",
      "The workspace backup could not be verified.",
      502
    );
  }
  return transitionUpgrade(env.DB, upgrade.id, "target_verified", "backup_complete", {
    checkpoint_bookmark: bookmark,
    backup_r2_key: key
  });
}

async function verifyBoundMailObjects(env: WorkerEnv): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT object_key FROM (
         SELECT html_r2_key AS object_key FROM messages WHERE html_r2_key IS NOT NULL
         UNION ALL SELECT raw_r2_key FROM messages WHERE raw_r2_key IS NOT NULL
         UNION ALL SELECT r2_key FROM message_attachments
       ) LIMIT 12`
  ).all<{ object_key: string }>();
  for (const row of rows.results) {
    if (!(await env.MAIL_OBJECTS.head(row.object_key))) {
      throw new AppError(
        "UPGRADE_MAIL_BUCKET_MISMATCH",
        "The bound mail bucket does not contain an object referenced by the Community database.",
        409
      );
    }
  }
}
