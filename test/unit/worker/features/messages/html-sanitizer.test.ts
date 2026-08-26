import {
  sanitizeMessageHtml,
  sanitizeQuotedMessageHtml
} from "@worker/features/messages/html-sanitizer";
import { describe, expect, it } from "vitest";
import { clientQuoteHtmlFixtures } from "../../../../fixtures/client-quote-html";

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

  it("can target the stable API path for inline images", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [attachment],
      origin: "https://mail.example.com",
      html: '<img src="cid:signature-logo@example.com">',
      inlineBasePath: "/api/v2/messages",
      messageId: "msg-1"
    });

    expect(result.html).toContain("https://mail.example.com/api/v2/messages/msg-1/inline/att-logo");
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

  it("separates Gmail-compatible quoted history for reader disclosure", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: `<p>New reply</p><div class="gmail_quote"><div class="gmail_attr">On Tuesday, Pat wrote:</div><blockquote><strong>Earlier reply</strong></blockquote></div>`,
      messageId: "msg-1"
    });

    expect(result.html).toBe("<p>New reply</p>");
    expect(result.quotedHtml).toContain("<strong>Earlier reply</strong>");
    expect(result.quotedHtml).not.toContain("gmail_quote");
  });

  it("reports remote images separately for collapsed quoted history", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<p>New reply</p><div class="gmail_quote"><img src="https://images.example.com/old.gif"></div>',
      messageId: "msg-1"
    });

    expect(result.hasRemoteImages).toBe(true);
    expect(result.htmlHasRemoteImages).toBe(false);
    expect(result.quotedHtmlHasRemoteImages).toBe(true);
    expect(result.afterQuotedHtmlHasRemoteImages).toBe(false);
  });

  it("collapses the complete Gmail reply container including its attribution", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: `<p>New reply</p><div class="gmail_quote gmail_quote_container"><div class="gmail_attr"><br>On Tuesday, Pat &lt;pat@example.com&gt; wrote:<br></div><blockquote class="gmail_quote"><strong>Earlier reply</strong></blockquote></div>`,
      messageId: "msg-1"
    });

    expect(result.html).toBe("<p>New reply</p>");
    expect(result.quotedHtml).toContain("On Tuesday");
    expect(result.quotedHtml).toContain("Earlier reply");
  });

  it.each([
    ["without an authored introduction", ""],
    ["after an authored introduction", "<p>For your information</p>"]
  ])("keeps a Gmail forward visible %s", (_description, introduction) => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: `${introduction}<div class="gmail_quote gmail_quote_container"><div class="gmail_attr">---------- Forwarded message ---------<br>From: The Google Workspace Team &lt;workspace-noreply@google.com&gt;<br>Subject: Promotional access</div><table><tbody><tr><td><strong>Forwarded promotion</strong></td></tr></tbody></table></div>`,
      messageId: "msg-1"
    });

    expect(result.html).toContain("---------- Forwarded message ---------");
    expect(result.html).toContain("<strong>Forwarded promotion</strong>");
    if (introduction) expect(result.html).toContain("For your information");
    expect(result.quotedHtml).toBeNull();
  });

  it("keeps Gmail's structural forward wrapper visible regardless of the subject", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<p>For your information</p><div class="gmail_quote gmail_quote_container"><div class="gmail_attr">---------- Forwarded message ---------<br>From: Pat &lt;pat@example.com&gt;</div><p>Forwarded report</p><blockquote class="gmail_quote">Forwarded quoted history</blockquote></div>',
      messageId: "msg-1"
    });

    expect(result.html).toContain("For your information");
    expect(result.html).toContain("Forwarded report");
    expect(result.html).toContain("Forwarded quoted history");
    expect(result.quotedHtml).toBeNull();
  });

  it("still collapses forwarded content when it is quoted by a reply", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: `<p>New reply</p><div class="gmail_quote"><div class="gmail_attr">---------- Forwarded message ---------</div><strong>Earlier forward</strong></div>`,
      messageId: "msg-1"
    });

    expect(result.html).toBe("<p>New reply</p>");
    expect(result.quotedHtml).toContain("Earlier forward");
  });

  it("does not use a forward subject to override a structural reply quote", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<p>Forward note</p><div class="gmail_quote"><strong>Earlier message</strong></div>',
      messageId: "msg-1"
    });

    expect(result.html).toBe("<p>Forward note</p>");
    expect(result.quotedHtml).toContain("Earlier message");
  });

  it.each([
    ["Proton", '<div class="protonmail_quote"><strong>Earlier reply</strong></div>'],
    ["Yahoo", '<div class="yahoo_quoted"><strong>Earlier reply</strong></div>'],
    ["Tuta", '<blockquote class="tutanota_quote"><strong>Earlier reply</strong></blockquote>'],
    ["Zoho", '<div class="zmail_extra"><strong>Earlier reply</strong></div>'],
    ["Outlook", '<blockquote id="isReplyContent"><strong>Earlier reply</strong></blockquote>'],
    ["Thunderbird", '<blockquote type="cite"><strong>Earlier reply</strong></blockquote>']
  ])("separates recognized %s reply history", (_client, quote) => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: `<p>New reply</p>${quote}`,
      messageId: "msg-1"
    });

    expect(result.html).toBe("<p>New reply</p>");
    expect(result.quotedHtml).toContain("Earlier reply");
    expect(result.afterQuotedHtml).toBeNull();
  });

  it.each(clientQuoteHtmlFixtures)("separates reduced real-world $client reply markup", ({
    currentText,
    html,
    quotedText
  }) => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html,
      messageId: "msg-1"
    });

    expect(result.html).toContain(currentText);
    expect(result.html).not.toContain(quotedText);
    expect(result.quotedHtml).toContain(quotedText);
    expect(result.afterQuotedHtml).toBeNull();
  });

  it("keeps authored content and the current signature after reply history visible", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: `<p>Answer above</p><div class="gmail_quote"><p>Earlier reply</p><div class="gmail_signature">Older signature</div></div><p>Inline answer below</p><div class="gmail_signature">Current signature</div>`,
      messageId: "msg-1"
    });

    expect(result.html).toContain("Answer above");
    expect(result.quotedHtml).toContain("Earlier reply");
    expect(result.quotedHtml).toContain("Older signature");
    expect(result.afterQuotedHtml).toContain("Inline answer below");
    expect(result.afterQuotedHtml).toContain("Current signature");
  });

  it("keeps the current signature visible when it precedes reply history", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: `<p>New reply</p><div class="gmail_signature">Current signature</div><div class="gmail_quote"><p>Earlier reply</p><div class="gmail_signature">Older signature</div></div>`,
      messageId: "msg-1"
    });

    expect(result.html).toContain("Current signature");
    expect(result.html).not.toContain("Older signature");
    expect(result.quotedHtml).toContain("Older signature");
  });

  it("returns a whole-body quote for the reader to show directly", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<blockquote type="cite"><p>Only visible content</p></blockquote>',
      messageId: "msg-1"
    });

    expect(result.html).toBe("");
    expect(result.quotedHtml).toContain("Only visible content");
    expect(result.afterQuotedHtml).toBeNull();
  });

  it("does not treat an authored semantic blockquote as reply history", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: "<p>New reply</p><blockquote>A quotation in the new message</blockquote>",
      messageId: "msg-1"
    });

    expect(result.html).toContain("A quotation in the new message");
    expect(result.quotedHtml).toBeNull();
  });

  it("requires an Outlook sender header after a border separator", () => {
    const reply = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<p>New reply</p><div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0in 0in 0in"></div><div>From: Pat &lt;pat@example.com&gt;<br>Sent: Tuesday<br>Subject: Earlier</div><p>Earlier reply</p>',
      messageId: "msg-1"
    });
    const authoredDivider = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<p>New reply</p><div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0in 0in 0in"></div><p>Design note</p>',
      messageId: "msg-1"
    });

    expect(reply.html).toBe("<p>New reply</p>");
    expect(reply.quotedHtml).toContain("Earlier reply");
    expect(authoredDivider.quotedHtml).toBeNull();
    expect(authoredDivider.html).toContain("Design note");
  });

  it("includes content after an empty reply separator in quoted history", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<p>New reply</p><hr id="replySplit"><div>From: Pat &lt;pat@example.com&gt;</div><p>Earlier reply</p>',
      messageId: "msg-1"
    });

    expect(result.html).toBe("<p>New reply</p>");
    expect(result.quotedHtml).toContain("Earlier reply");
    expect(result.afterQuotedHtml).toBeNull();
  });

  it("recognizes the quoted-printable Outlook reply id", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: `<p>New reply</p><div id='3D"divRplyFwdMsg"'>From: Pat &lt;pat@example.com&gt;</div><p>Earlier reply</p>`,
      messageId: "msg-1"
    });

    expect(result.html).toBe("<p>New reply</p>");
    expect(result.quotedHtml).toContain("Earlier reply");
  });

  it("keeps authored wrapper text before an Outlook marker visible", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<div>Authored reply<div id="divRplyFwdMsg">From: Pat &lt;pat@example.com&gt;</div><p>Earlier reply</p></div>',
      messageId: "msg-1"
    });

    expect(result.html).toContain("Authored reply");
    expect(result.html).not.toContain("Earlier reply");
    expect(result.quotedHtml).toContain("Earlier reply");
  });

  it("uses the final recognized quote block when several sibling markers exist", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<p>New reply</p><div class="protonmail_quote">Earlier marker</div><p>Still current</p><div class="protonmail_quote">Actual history</div><p>Footer</p>',
      messageId: "msg-1"
    });

    expect(result.html).toContain("Earlier marker");
    expect(result.html).toContain("Still current");
    expect(result.quotedHtml).toContain("Actual history");
    expect(result.afterQuotedHtml).toContain("Footer");
  });

  it("includes content after Proton's original-message text fallback in quoted history", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: "<p>New reply</p><div>\n  ------- Original Message -------  \n</div><p>Earlier reply</p>",
      messageId: "msg-1"
    });

    expect(result.html).toBe("<p>New reply</p>");
    expect(result.quotedHtml).toContain("Original Message");
    expect(result.quotedHtml).toContain("Earlier reply");
    expect(result.afterQuotedHtml).toBeNull();
  });

  it("detects blocked remote images in content after a quote", () => {
    const result = sanitizeMessageHtml({
      allowRemoteImages: false,
      attachments: [],
      origin: "https://mail.example.com",
      html: '<p>New reply</p><div class="gmail_quote">Earlier reply</div><img src="https://images.example.com/signature.png">',
      messageId: "msg-1"
    });

    expect(result.hasRemoteImages).toBe(true);
    expect(result.afterQuotedHtmlHasRemoteImages).toBe(true);
    expect(result.afterQuotedHtml).toContain("Remote image hidden");
    expect(result.afterQuotedHtml).not.toContain("images.example.com");
  });

  it("preserves safe rich HTML, remote images, and referenced CID images for outbound quotes", () => {
    const result = sanitizeQuotedMessageHtml({
      attachments: [attachment],
      html: `<script>alert(1)</script><table style="width: 100%; position: fixed"><tbody><tr><td><strong>Rich reply</strong></td></tr></tbody></table>
        <img src="cid:signature-logo@example.com" onerror="alert(1)">
        <img src="https://images.example.com/banner.png">
        <img src="cid:missing@example.com">`
    });

    expect(result.html).toContain("<table");
    expect(result.html).toContain("<strong>Rich reply</strong>");
    expect(result.html).toContain('src="cid:signature-logo@example.com"');
    expect(result.html).toContain('src="https://images.example.com/banner.png"');
    expect(result.html).not.toContain("position");
    expect(result.html).not.toContain("onerror");
    expect(result.html).not.toContain("missing@example.com");
    expect(result.inlineAttachmentIds).toEqual(["att-logo"]);
  });
});
