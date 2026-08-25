import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertAccountId } from "./lifecycle-manifest.mjs";
import { rootDir } from "./paths.mjs";

const cloudflareApi = "https://api.cloudflare.com/client/v4";
const deleteConcurrency = 20;

export async function emptyR2Bucket(input, options = {}) {
  assertAccountId(input.accountId);
  assertBucketName(input.bucket);
  const authentication = options.authentication ?? readWranglerAuthentication(options);
  const headers = authenticationHeaders(authentication);
  const fetchRequest = options.fetchRequest ?? fetch;
  const objectsUrl = `${cloudflareApi}/accounts/${input.accountId}/r2/buckets/${input.bucket}/objects`;
  let deleted = 0;

  while (true) {
    const page = await cloudflareRequest(
      fetchRequest,
      `${objectsUrl}?per_page=1000`,
      { headers },
      "list objects"
    );
    if (!Array.isArray(page.result)) {
      throw new Error("Cloudflare returned an invalid R2 object list.");
    }
    const keys = page.result.map((object) => object?.key);
    if (keys.some((key) => typeof key !== "string" || key.length === 0)) {
      throw new Error("Cloudflare returned an R2 object without a valid key.");
    }
    if (keys.length === 0) return deleted;

    for (let offset = 0; offset < keys.length; offset += deleteConcurrency) {
      await Promise.all(
        keys
          .slice(offset, offset + deleteConcurrency)
          .map((key) =>
            cloudflareRequest(
              fetchRequest,
              `${objectsUrl}/${encodeObjectKey(key)}`,
              { headers, method: "DELETE" },
              "delete an object"
            )
          )
      );
    }
    deleted += keys.length;
  }
}

export function authenticationHeaders(authentication) {
  if (
    (authentication?.type === "api_token" || authentication?.type === "oauth") &&
    typeof authentication.token === "string" &&
    authentication.token.trim()
  ) {
    return { Authorization: `Bearer ${authentication.token.trim()}` };
  }
  if (
    authentication?.type === "api_key" &&
    typeof authentication.key === "string" &&
    authentication.key.trim() &&
    typeof authentication.email === "string" &&
    authentication.email.trim()
  ) {
    return {
      "X-Auth-Email": authentication.email.trim(),
      "X-Auth-Key": authentication.key.trim()
    };
  }
  throw new Error("Wrangler did not return usable Cloudflare authentication.");
}

function readWranglerAuthentication(options) {
  const runAuthentication = options.runAuthentication ?? defaultAuthenticationCommand;
  let authentication;
  try {
    authentication = JSON.parse(runAuthentication());
  } catch {
    throw new Error(
      "Could not read Wrangler authentication. Run wrangler login or set CLOUDFLARE_API_TOKEN."
    );
  }
  return authentication;
}

function defaultAuthenticationCommand() {
  const result = spawnSync("pnpm", ["exec", "wrangler", "auth", "token", "--json"], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, CI: process.env.CI ?? "true" }
  });
  if (result.status !== 0) {
    throw new Error("Wrangler authentication failed.");
  }
  return result.stdout ?? "";
}

async function cloudflareRequest(fetchRequest, url, init, operation) {
  let response;
  try {
    response = await fetchRequest(url, init);
  } catch {
    throw new Error(`Could not ${operation} in the recorded R2 bucket.`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Could not ${operation} in the recorded R2 bucket (HTTP ${response.status}).`);
  }
  if (!response.ok || payload?.success !== true) {
    const code = payload?.errors?.[0]?.code;
    const suffix = code == null ? "" : `, Cloudflare code ${code}`;
    throw new Error(
      `Could not ${operation} in the recorded R2 bucket (HTTP ${response.status}${suffix}).`
    );
  }
  return payload;
}

function encodeObjectKey(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function assertBucketName(bucket) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket ?? "")) {
    throw new Error("Refusing to empty an invalid R2 bucket name.");
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  try {
    const [accountId, bucket] = process.argv.slice(2);
    const deleted = await emptyR2Bucket({ accountId, bucket });
    console.log(`Emptied recorded R2 bucket "${bucket}" (${deleted} objects).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
