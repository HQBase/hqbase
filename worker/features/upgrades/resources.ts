import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { cloudflare } from "./cloudflare";
import { transitionUpgrade } from "./queries";
import type { UpgradeRecord } from "./types";

export type PreparedResources = {
  jobsQueue: string;
  deadLetterQueue: string;
  candidateRelease?: {
    version: string;
    mainSha256: string;
  };
  resources: Array<{
    type: "queue" | "secret" | "d1" | "r2" | "worker";
    name: string;
    id: string;
    ownership: "created" | "reused";
    disposition: "persistent" | "disposable";
  }>;
};

export async function prepareProResources(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<{ upgrade: UpgradeRecord; prepared: PreparedResources }> {
  if (!upgrade.accountId) {
    throw new AppError("UPGRADE_TARGET_INCOMPLETE", "The verified target account is missing.", 409);
  }
  const suffix = upgrade.installationId.replaceAll("-", "").slice(0, 12);
  const jobsQueue = boundedQueueName(`${upgrade.workerName}-pro-jobs-${suffix}`);
  const deadLetterQueue = boundedQueueName(`${upgrade.workerName}-pro-dlq-${suffix}`);
  const existing = await cloudflare<Array<{ queue_id?: string; queue_name?: string }>>(
    token,
    `/accounts/${upgrade.accountId}/queues?per_page=100`,
    {},
    fetcher
  );
  if (!upgrade.d1DatabaseId || !upgrade.r2BucketName) {
    throw new AppError(
      "UPGRADE_TARGET_INCOMPLETE",
      "The verified data resources are missing.",
      409
    );
  }
  const resources: PreparedResources["resources"] = [
    {
      type: "d1",
      name: "DB",
      id: upgrade.d1DatabaseId,
      ownership: "reused",
      disposition: "persistent"
    },
    {
      type: "r2",
      name: upgrade.r2BucketName,
      id: upgrade.r2BucketName,
      ownership: "reused",
      disposition: "persistent"
    }
  ];
  for (const name of [jobsQueue, deadLetterQueue]) {
    const current = existing.find((queue) => queue.queue_name === name);
    if (current?.queue_id) {
      resources.push({
        type: "queue",
        name,
        id: current.queue_id,
        ownership: "reused",
        disposition: "persistent"
      });
      continue;
    }
    const created = await cloudflare<{ queue_id?: string; queue_name?: string }>(
      token,
      `/accounts/${upgrade.accountId}/queues`,
      { method: "POST", body: JSON.stringify({ queue_name: name }) },
      fetcher
    );
    if (!created.queue_id || created.queue_name !== name) {
      throw new AppError(
        "UPGRADE_QUEUE_CREATE_FAILED",
        "Cloudflare did not confirm the Pro queue.",
        502
      );
    }
    resources.push({
      type: "queue",
      name,
      id: created.queue_id,
      ownership: "created",
      disposition: "persistent"
    });
  }
  const prepared = { jobsQueue, deadLetterQueue, resources };
  return {
    prepared,
    upgrade: await transitionUpgrade(env.DB, upgrade.id, "backup_complete", "resources_prepared", {
      created_resources_json: JSON.stringify(prepared)
    })
  };
}

export function requireCandidateRelease(
  prepared: PreparedResources
): NonNullable<PreparedResources["candidateRelease"]> {
  const release = prepared.candidateRelease;
  if (
    !release ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(release.version) ||
    !/^[a-f0-9]{64}$/.test(release.mainSha256)
  ) {
    throw new AppError(
      "UPGRADE_CANDIDATE_RELEASE_MISSING",
      "The signed Pro candidate identity is incomplete. Prepare the candidate again before migration.",
      409
    );
  }
  return release;
}

export async function readPreparedResources(
  db: D1Database,
  upgradeId: string
): Promise<PreparedResources> {
  const row = await db
    .prepare("SELECT created_resources_json FROM community_pro_upgrades WHERE id = ?")
    .bind(upgradeId)
    .first<{ created_resources_json: string }>();
  const parsed = JSON.parse(row?.created_resources_json ?? "null") as PreparedResources | null;
  if (!parsed?.jobsQueue || !parsed.deadLetterQueue || !Array.isArray(parsed.resources)) {
    throw new AppError(
      "UPGRADE_RESOURCES_MISSING",
      "The Pro resource inventory is incomplete.",
      409
    );
  }
  return parsed;
}

export async function recordPreparedSecretOwnership(
  db: D1Database,
  upgradeId: string,
  prepared: PreparedResources,
  originalSecretNames: string[],
  secretNames: readonly string[]
): Promise<PreparedResources> {
  const existing = new Set(originalSecretNames);
  const disposable = new Set([
    "HQBASE_SETUP_OAUTH_ACCESS_TOKEN",
    "PRO_UPGRADE_ORCHESTRATION_SECRET"
  ]);
  const updated: PreparedResources = {
    ...prepared,
    resources: [
      ...prepared.resources.filter((resource) => resource.type !== "secret"),
      ...secretNames.map((name) => ({
        type: "secret" as const,
        name,
        id: name,
        ownership: existing.has(name) ? ("reused" as const) : ("created" as const),
        disposition: disposable.has(name) ? ("disposable" as const) : ("persistent" as const)
      }))
    ]
  };
  await db
    .prepare(
      `UPDATE community_pro_upgrades
       SET created_resources_json = ?, updated_at = datetime('now')
       WHERE id = ? AND state = 'resources_prepared'`
    )
    .bind(JSON.stringify(updated), upgradeId)
    .run();
  return updated;
}

function boundedQueueName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .slice(0, 63);
}
