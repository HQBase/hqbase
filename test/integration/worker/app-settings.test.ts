import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { getRequiredSetting, getSetting, setSetting } from "../../../worker/db/client";
import { applyCurrentMigrations } from "./current-migrations";

const settingSchema = z.object({
  enabled: z.boolean(),
  labels: z.array(z.string())
});

describe("application settings", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM app_settings").run();
  });

  it("returns null for an optional missing setting", async () => {
    await expect(getSetting(env.DB, "missing", settingSchema)).resolves.toBeNull();
  });

  it("throws the existing error for a required missing setting", async () => {
    await expect(getRequiredSetting(env.DB, "missing", settingSchema)).rejects.toMatchObject({
      code: "SETTING_NOT_FOUND",
      status: 500
    });
  });

  it("round-trips JSON and updates the existing key", async () => {
    const firstValue = { enabled: false, labels: ["first"] };
    const updatedValue = { enabled: true, labels: ["updated", "second"] };

    await setSetting(env.DB, "feature", firstValue);
    await expect(getSetting(env.DB, "feature", settingSchema)).resolves.toEqual(firstValue);

    await setSetting(env.DB, "feature", updatedValue);
    await expect(getSetting(env.DB, "feature", settingSchema)).resolves.toEqual(updatedValue);

    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM app_settings WHERE key = 'feature'"
    ).first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it("keeps Zod validation on reads", async () => {
    const timestamp = "2026-08-19T12:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO app_settings (key, value_json, created_at, updated_at)
       VALUES ('invalid', '{"enabled":"yes","labels":[]}', ?, ?)`
    )
      .bind(timestamp, timestamp)
      .run();

    await expect(getSetting(env.DB, "invalid", settingSchema)).rejects.toBeInstanceOf(z.ZodError);
  });
});
