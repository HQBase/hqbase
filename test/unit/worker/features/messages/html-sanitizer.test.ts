import { sanitizeMessageHtml } from "@worker/features/messages/html-sanitizer";
import { describe, expect, it } from "vitest";

const attachment = {
  id: "att-logo",
  messageId: "msg-1",
  filename: "logo.png",
  contentType: "image/png",
  sizeBytes: 120,
  contentId: "<signature-logo@example.com>",
  r2Key: "messages/logo.png",
  createdAt: "2026-07-13T00:00:00.000Z"
};

describe("email HTML sanitizer", () => {
  it("keeps basic formatting and resolves same-message CID images", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [attachment],
      origin: "https://mail.example.com",
      html: `<table style="width: 100%; color: #222; position: fixed">
        <tr><td><strong>Hello</strong></td></tr>
      </table><img src="cid:signature-logo%40example.com" onerror="alert(1)">`,
      messageId: "msg-1"
    });

    expect(result.hasRemoteImages).toBe(false);
    expect(result.html).toContain("<table");
    expect(result.html).toContain("width:100%");
    expect(result.html).toContain("color:#222");
    expect(result.html).not.toContain("position");
    expect(result.html).toContain("https://mail.example.com/api/messages/msg-1/inline/att-logo");
    expect(result.html).not.toContain("onerror");
  });

  it("removes active content, unsafe links, redirects, and CSS resource loads", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: `<meta http-equiv="refresh" content="0;url=https://evil.example">
        <style>@import "https://evil.example/font.css";</style>
        <script>alert(1)</script><form action="https://evil.example"><input></form>
        <iframe src="https://evil.example"></iframe><object data="https://evil.example"></object>
        <a href="javascript:alert(1)" onclick="alert(1)">unsafe</a>
        <a href="https://example.com/path">safe</a>
        <p style="background-image:url(https://evil.example/pixel); color: red">Text</p>`,
      messageId: "msg-1"
    });

    expect(result.hasRemoteImages).toBe(true);
    expect(result.html).not.toMatch(/<script|<form|<input|<iframe|<object|<meta|<style/i);
    expect(result.html).not.toContain("evil.example");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).not.toContain("onclick");
    expect(result.html).toContain('href="https://example.com/path"');
    expect(result.html).toContain('target="_blank"');
    expect(result.html).toContain("color:red");
  });

  it("blocks remote images until the user loads them", () => {
    const blocked = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<img src="https://images.example.com/open.gif" srcset="https://images.example.com/2x.png 2x">',
      messageId: "msg-1"
    });
    const loaded = sanitizeMessageHtml({
      allowRemoteImages: true,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<img src="//images.example.com/open.gif">',
      messageId: "msg-1"
    });

    expect(blocked.hasRemoteImages).toBe(true);
    expect(blocked.html).not.toContain("images.example.com");
    expect(blocked.html).toContain("Remote image hidden");
    expect(loaded.html).toContain('src="https://images.example.com/open.gif"');
    expect(loaded.html).toContain('referrerpolicy="no-referrer"');
  });

  it("detects remote srcset content even without a src attribute", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<img srcset="https://images.example.com/open.gif 1x">',
      messageId: "msg-1"
    });

    expect(result.hasRemoteImages).toBe(true);
    expect(result.html).not.toContain("images.example.com");
  });
});
