import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildEmailHtmlDocument } from "@/features/messages/html-document";
import {
  EmailFrame,
  QuotedContentDivider,
  RemoteImagesAlert,
  splitQuotedText
} from "@/features/messages/message-html";

describe("message HTML view", () => {
  it("keeps remote origins out of the iframe policy until images are loaded", () => {
    const blocked = buildEmailHtmlDocument({
      allowRemoteImages: false,
      html: "<strong>Hello</strong>",
      origin: "https://mail.example.com",
      theme: "dark"
    });
    const loaded = buildEmailHtmlDocument({
      allowRemoteImages: true,
      html: "<strong>Hello</strong>",
      origin: "https://mail.example.com",
      theme: "dark"
    });

    expect(blocked).toContain("img-src https://mail.example.com;");
    expect(blocked).toContain("font-src https://mail.example.com;");
    expect(blocked).toContain('font-family: "Geist Sans"');
    expect(blocked).toContain('url("/fonts/Geist-Regular.woff2")');
    expect(blocked).toContain('data-theme="dark"');
    expect(blocked).toContain("background: transparent");
    expect(blocked).toContain("color: #f2f2f2");
    expect(blocked).toContain("overflow-x: auto");
    expect(blocked).toContain("overflow-y: hidden");
    expect(blocked).toContain("-webkit-overflow-scrolling: touch");
    expect(blocked).toContain("margin: 0; padding: 0");
    expect(blocked).not.toContain("min-height: 100%");
    expect(blocked).not.toContain("max-width: 100%");
    expect(blocked).not.toContain("https: http:");
    expect(loaded).toContain("img-src https://mail.example.com https: http:");
  });

  it("uses transparent light defaults without rewriting sender HTML", () => {
    const source = '<div style="background-color:#fff">Hello</div>';
    const html = buildEmailHtmlDocument({
      allowRemoteImages: false,
      html: source,
      origin: "https://mail.example.com",
      theme: "light"
    });

    expect(html).toContain('data-theme="light"');
    expect(html).toContain("background: transparent");
    expect(html).toContain("color: #171717");
    expect(html).toContain(source);
  });

  it("renders the email document without app-owned panel chrome or a minimum height", () => {
    const html = renderToStaticMarkup(<EmailFrame srcDoc="<p>Hello</p>" title="Message body" />);

    expect(html).toContain('class="block w-full border-0 bg-transparent"');
    expect(html).toContain('height="0"');
    expect(html).not.toContain("rounded");
    expect(html).not.toContain("min-h");
  });

  it("shows both one-time and persistent sender actions for inbound mail", () => {
    const html = renderToStaticMarkup(
      <RemoteImagesAlert
        direction="inbound"
        fromAddress="sender@example.com"
        loadingImages={false}
        onAlwaysLoad={() => undefined}
        onLoad={() => undefined}
        savingTrust={false}
      />
    );

    expect(html).toContain("Remote images are hidden");
    expect(html).toContain("Loading them may tell the sender that you opened this message.");
    expect(html).toContain("Load images");
    expect(html).toContain("Always load from sender");
  });

  it("renders an accessible ellipsis disclosure for quoted history", () => {
    const html = renderToStaticMarkup(
      <QuotedContentDivider expanded={false} onToggle={() => undefined} />
    );

    expect(html).toContain('aria-label="Show quoted message history"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("...");
  });

  it("separates conventional plain-text reply history", () => {
    expect(
      splitQuotedText(
        "New reply\n\nOn 2026-07-28 at 15:29 UTC, owner@example.com wrote:\n> Earlier reply"
      )
    ).toEqual({
      body: "New reply",
      quote: "On 2026-07-28 at 15:29 UTC, owner@example.com wrote:\n> Earlier reply"
    });
  });
});
