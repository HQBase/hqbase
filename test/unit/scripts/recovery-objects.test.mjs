import { describe, expect, it, vi } from "vitest";
import {
  validateRelease,
  verifyObjectReferences
} from "../../../scripts/hqbase/recovery-verification.mjs";

const manifest = { accountId: "account", d1: { id: "db" }, r2: { bucket: "mail" } };
const authentication = { type: "api_token", token: "synthetic-token" };
function responses(missing = false) {
  return vi.fn(async (url, init) => {
    if (url.includes("/objects"))
      return Response.json({
        success: true,
        result: [{ key: url.includes("cursor=") ? (missing ? "d" : "c") : "a" }],
        result_info: url.includes("cursor=")
          ? { is_truncated: false }
          : { is_truncated: true, cursor: "page2" }
      });
    const { sql } = JSON.parse(init.body);
    const results = sql.includes("table_info")
      ? [{ name: "text_r2_key" }]
      : sql.includes("sqlite_schema")
        ? [{ name: "send_operations" }]
        : [{ key: "a" }, { key: "c" }];
    return Response.json({ success: true, result: [{ success: true, results }] });
  });
}
describe("recovery object integrity", () => {
  it("checks references across all inventory pages without reading mail content", async () => {
    const fetchRequest = responses();
    await expect(verifyObjectReferences(manifest, { authentication, fetchRequest })).resolves.toBe(
      2
    );
    expect(fetchRequest.mock.calls.filter(([url]) => url.includes("/objects"))).toHaveLength(2);
    expect(fetchRequest.mock.calls.every(([url]) => !url.includes("/objects/"))).toBe(true);
  });
  it("fails when a referenced object is missing without disclosing its key", async () => {
    await expect(
      verifyObjectReferences(manifest, { authentication, fetchRequest: responses(true) })
    ).rejects.toThrow("referenced mail object is missing");
  });
  it("rejects an unrelated or mismatched release marker", () => {
    const row = {
      schema_product: "hqbase",
      product: "hqbase",
      installed_version: "1.3.4",
      installed_schema_version: 3,
      channel: "stable"
    };
    expect(validateRelease([row], row)).toEqual(row);
    expect(() => validateRelease([row], { ...row, installed_version: "1.3.3" })).toThrow(
      "release state"
    );
    expect(() => validateRelease([])).toThrow("release state");
  });
});
