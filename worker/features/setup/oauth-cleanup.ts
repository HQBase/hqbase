import type { WorkerEnv } from "../../lib/env";

export async function revokeSetupGrant(
  env: WorkerEnv,
  accountId: string | null | undefined
): Promise<void> {
  const token = env.HQBASE_SETUP_OAUTH_ACCESS_TOKEN;
  if (!token) return;

  if (accountId && env.HQBASE_WORKER_NAME) {
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${env.HQBASE_WORKER_NAME}/secrets/HQBASE_SETUP_OAUTH_ACCESS_TOKEN`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } }
    ).catch(() => undefined);
  }

  await fetch("https://dash.cloudflare.com/oauth2/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token,
      ...(env.CLOUDFLARE_OAUTH_CLIENT_ID ? { client_id: env.CLOUDFLARE_OAUTH_CLIENT_ID } : {})
    })
  });
}
