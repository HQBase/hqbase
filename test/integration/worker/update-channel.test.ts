import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getUpdateChannel, setUpdateChannel } from "../../../worker/features/updates/channel";
import { applyCurrentMigrations } from "./current-migrations";

describe("workspace update channel", () => {
  beforeAll(applyCurrentMigrations);
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM app_settings WHERE key = 'update_channel'").run();
  });
  it("defaults existing and fresh installations to Stable", async () => {
    expect(await getUpdateChannel(env.DB)).toBe("stable");
  });
  it("preserves the installed version and schema when leaving Nightly", async () => {
    const before = await env.DB.prepare("SELECT * FROM release_state").all();
    await setUpdateChannel(env.DB, "nightly");
    expect(await getUpdateChannel(env.DB)).toBe("nightly");
    await setUpdateChannel(env.DB, "stable");
    expect(await getUpdateChannel(env.DB)).toBe("stable");
    expect((await env.DB.prepare("SELECT * FROM release_state").all()).results).toEqual(
      before.results
    );
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS count FROM update_history").first<{
          count: number;
        }>()
      )?.count
    ).toBe(0);
  });
});
