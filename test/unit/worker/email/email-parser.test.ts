import { readFile } from "node:fs/promises";
import { parseRawEmail } from "@worker/email/parse-email";
import { describe, expect, it } from "vitest";

describe("parseRawEmail", () => {
  it("parses text messages", async () => {
    const raw = await readFixture("simple-text.eml");
    const parsed = await parseRawEmail(raw);

    expect(parsed.fromAddress).toBe("alice@example.net");
    expect(parsed.to).toContain("support@example.com");
    expect(parsed.subject).toBe("Need help with billing");
    expect(parsed.snippet).toContain("Can you help me");
  });

  it("extracts html and attachments", async () => {
    const raw = await readFixture("html-with-attachment.eml");
    const parsed = await parseRawEmail(raw);

    expect(parsed.htmlBody).toContain("<strong>HTML</strong>");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]?.filename).toBe("brief.txt");
  });

  it("captures reply headers", async () => {
    const raw = await readFixture("reply-thread.eml");
    const parsed = await parseRawEmail(raw);

    expect(parsed.inReplyTo).toBe("<welcome-1@example.com>");
    expect(parsed.references).toEqual(["<welcome-1@example.com>"]);
  });
});

async function readFixture(name: string): Promise<ArrayBuffer> {
  const buffer = await readFile(new URL(`../../../fixtures/email/${name}`, import.meta.url));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
