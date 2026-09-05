import { parseD1Rows } from "../release/after-deploy-state.mjs";
import { run } from "./command.mjs";
import { authenticationHeaders, readWranglerAuthentication } from "./empty-r2.mjs";
import { configPath } from "./manifest.mjs";

export const releaseInspectionSql = `SELECT s.value AS schema_product, r.product,
  r.installed_version, r.installed_schema_version, r.channel
  FROM hqbase_schema_state s CROSS JOIN release_state r
  WHERE s.key = 'product' AND r.singleton = 1`;

export function inspectRelease(manifest) {
  const rows = parseD1Rows(
    run(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        manifest.d1.name,
        "--remote",
        "--json",
        "--command",
        releaseInspectionSql,
        "--config",
        configPath(manifest.name)
      ],
      { quiet: true, stdoutOnly: true }
    )
  );
  return validateRelease(rows);
}

export function validateRelease(rows, expected) {
  const row = rows?.[0];
  if (
    rows?.length !== 1 ||
    row?.schema_product !== "hqbase" ||
    row.product !== "hqbase" ||
    row.channel !== "stable" ||
    !/^\d+\.\d+\.\d+$/.test(row.installed_version) ||
    !Number.isInteger(row.installed_schema_version) ||
    row.installed_schema_version < 1 ||
    (expected && Object.keys(row).some((key) => row[key] !== expected[key]))
  ) {
    throw new Error("The database release state does not match the recovery checkpoint.");
  }
  return row;
}

// Compare two ordered streams. Keep at most one page from each service in memory.
export async function verifyObjectReferences(manifest, options = {}) {
  const headers = authenticationHeaders(options.authentication ?? readWranglerAuthentication());
  const request = options.fetchRequest ?? fetch;
  const base = `https://api.cloudflare.com/client/v4/accounts/${manifest.accountId}`;
  async function json(url, init) {
    try {
      const response = await request(url, {
        ...init,
        headers: { ...headers, "Content-Type": "application/json" }
      });
      const payload = await response.json();
      if (!response.ok || payload.success !== true) throw new Error();
      return payload;
    } catch {
      throw new Error("Could not verify mail objects in the recorded Cloudflare resources.");
    }
  }
  async function query(sql, params = []) {
    const payload = await json(`${base}/d1/database/${manifest.d1.id}/query`, {
      method: "POST",
      body: JSON.stringify({ sql, params })
    });
    return parseD1Rows(JSON.stringify(payload));
  }
  const columns = await query("PRAGMA table_info(messages)");
  const hasTextObjects = columns.some((row) => row.name === "text_r2_key");
  const tables = await query(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'send_operations'"
  );
  const referenceSql = `SELECT DISTINCT value AS key FROM messages, json_each(json_array(raw_r2_key, html_r2_key${hasTextObjects ? ", text_r2_key" : ""})) WHERE value IS NOT NULL
    UNION SELECT r2_key AS key FROM message_attachments
    UNION SELECT r2_key AS key FROM draft_attachments
    ${tables.length ? "UNION SELECT value AS key FROM send_operations, json_each(object_keys_json) WHERE status <> 'stored'" : ""}`;
  async function* references() {
    let previous = "";
    while (true) {
      const rows = await query(
        `SELECT key FROM (${referenceSql}) WHERE key > ? ORDER BY key LIMIT 1000`,
        [previous]
      );
      for (const row of rows) {
        if (
          typeof row.key !== "string" ||
          Buffer.compare(Buffer.from(row.key), Buffer.from(previous)) <= 0
        )
          throw new Error("Invalid object reference order.");
        previous = row.key;
        yield row.key;
      }
      if (rows.length < 1000) return;
    }
  }
  async function* objects() {
    let cursor = "";
    do {
      const page = await json(
        `${base}/r2/buckets/${manifest.r2.bucket}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { method: "GET" }
      );
      if (!Array.isArray(page.result)) throw new Error("Invalid mail object inventory.");
      for (const object of page.result) {
        if (typeof object.key !== "string") throw new Error("Invalid mail object inventory.");
        yield object.key;
      }
      const next = page.result_info?.is_truncated ? page.result_info.cursor : "";
      if (page.result_info?.is_truncated && (!next || next === cursor))
        throw new Error("Mail object inventory did not advance.");
      cursor = next;
    } while (cursor);
  }
  const inventory = objects();
  let current = await inventory.next();
  let count = 0;
  for await (const key of references()) {
    while (!current.done && Buffer.compare(Buffer.from(current.value), Buffer.from(key)) < 0)
      current = await inventory.next();
    if (current.done || current.value !== key)
      throw new Error(
        "Recovery is incomplete: a referenced mail object is missing. Restore the independent R2 copy before retrying verification."
      );
    count += 1;
  }
  return count;
}
