import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildDiscordReleaseMessages,
  DISCORD_EMBED_DESCRIPTION_LIMIT,
  sendDiscordRelease,
  splitDiscordMarkdown
} from "../../../scripts/release/notify-discord.mjs";

const releaseWorkflow = readFileSync(
  new URL("../../../.github/workflows/release.yml", import.meta.url),
  "utf8"
);

describe("Discord release notifications", () => {
  it("preserves complete release notes while splitting at readable boundaries", () => {
    const notes = `${"A".repeat(2800)}\n\n${"B".repeat(2800)}\n- final change`;
    const chunks = splitDiscordMarkdown(notes);

    expect(chunks.join("")).toBe(notes);
    expect(chunks.length).toBe(2);
    expect(chunks.every((chunk) => chunk.length <= DISCORD_EMBED_DESCRIPTION_LIMIT)).toBe(true);
  });

  it("builds numbered embeds with the full changelog and no mentions", () => {
    const notes = `## Changes\n\n- ${"First change. ".repeat(400)}\n- @everyone stays plain text.`;
    const messages = buildDiscordReleaseMessages({
      notes,
      repository: "HQBase/hqbase",
      version: "1.2.3",
      publishedAt: "2026-08-16T00:00:00.000Z"
    });

    expect(messages.length).toBeGreaterThan(1);
    expect(messages.map((message) => message.embeds[0].description).join("")).toBe(notes);
    expect(messages[0]).toMatchObject({
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: `HQBase 1.2.3 is available (1/${messages.length})`,
          url: "https://github.com/HQBase/hqbase/releases/tag/v1.2.3",
          footer: { text: "Signed stable release" },
          timestamp: "2026-08-16T00:00:00.000Z"
        }
      ]
    });
    expect(messages.at(-1).embeds[0].title).toBe(
      `HQBase 1.2.3 changes (${messages.length}/${messages.length})`
    );
  });

  it("requests confirmed delivery and retries a temporary Discord failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ retry_after: 0.01 }), {
          status: 429,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "message-id" }), { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      sendDiscordRelease({
        fetchImpl,
        notes: "- Complete release note",
        repository: "HQBase/hqbase",
        sleep,
        version: "1.2.3",
        webhookUrl: "https://discord.com/api/webhooks/123/secret"
      })
    ).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0].toString()).toBe(
      "https://discord.com/api/webhooks/123/secret?wait=true"
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      allowed_mentions: { parse: [] },
      embeds: [{ description: "- Complete release note" }]
    });
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("does not retry a permanent Discord rejection", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const sleep = vi.fn();

    await expect(
      sendDiscordRelease({
        fetchImpl,
        notes: "- Complete release note",
        repository: "HQBase/hqbase",
        sleep,
        version: "1.2.3",
        webhookUrl: "https://discord.com/api/webhooks/123/secret"
      })
    ).rejects.toThrow("HTTP 401");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("rejects non-Discord URLs without sending release notes", async () => {
    const fetchImpl = vi.fn();

    await expect(
      sendDiscordRelease({
        fetchImpl,
        notes: "- Complete release note",
        repository: "HQBase/hqbase",
        version: "1.2.3",
        webhookUrl: "https://example.com/api/webhooks/123/secret"
      })
    ).rejects.toThrow("official Discord webhook URL");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runs only after public release verification and cannot fail a valid release", () => {
    const verification = releaseWorkflow.indexOf(
      "Verify public stable asset, signature, and digest"
    );
    const notification = releaseWorkflow.indexOf("Post complete release notes to Discord");

    expect(verification).toBeGreaterThan(-1);
    expect(notification).toBeGreaterThan(verification);
    expect(releaseWorkflow).toContain(
      `DISCORD_WEBHOOK_URL: \${{ secrets.DISCORD_RELEASE_WEBHOOK_URL }}`
    );
    expect(releaseWorkflow.slice(notification)).toContain("continue-on-error: true");
  });
});
