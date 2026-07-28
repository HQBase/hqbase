import { buildReplyBody } from "@worker/features/send/reply-body";
import { describe, expect, it } from "vitest";

const original = {
  createdAt: "2026-07-28T15:30:00.000Z",
  fromAddress: "owner@example.com",
  receivedAt: "2026-07-28T15:29:00.000Z",
  sentAt: null,
  snippet: "Fallback",
  textBody: "First line\r\n\r\nSecond <line> & more"
};

describe("reply body", () => {
  it("appends conventional plain-text and Gmail-compatible HTML quotes", () => {
    const body = buildReplyBody(
      { html: "<p>Thanks</p>", text: "Thanks" },
      original,
      '<table><tbody><tr><td><strong>Rich reply</strong></td></tr></tbody></table><img src="cid:logo@example.com">'
    );

    expect(body.text).toBe(
      [
        "Thanks",
        "",
        "On 2026-07-28 at 15:29 UTC, owner@example.com wrote:",
        "> First line",
        ">",
        "> Second <line> & more"
      ].join("\n")
    );
    expect(body.html).toContain('class="gmail_quote gmail_quote_container"');
    expect(body.html).toContain('class="gmail_attr"');
    expect(body.html).toContain("<strong>Rich reply</strong>");
    expect(body.html).toContain('src="cid:logo@example.com"');
    expect(body.html).not.toContain("Second &lt;line&gt;");
  });

  it("falls back to escaped plain text when rich source HTML is unavailable", () => {
    const body = buildReplyBody({ html: "<p>Thanks</p>", text: "Thanks" }, original);

    expect(body.html).toContain("Second &lt;line&gt; &amp; more");
    expect(body.html).not.toContain("Second <line>");
  });

  it("bounds quoted message content", () => {
    const body = buildReplyBody({ text: "Reply" }, { ...original, textBody: "a".repeat(100_001) });

    expect(body.text).toContain("[Previous message truncated by HQBase]");
    expect(body.html).toBeUndefined();
  });
});
