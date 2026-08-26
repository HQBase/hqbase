import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildEmailHtmlDocument } from "@/features/messages/html-document";
import {
  EmailFrame,
  hasVisibleRemoteImages,
  MessageHtmlFrames,
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
    const signature = buildEmailHtmlDocument({
      allowDataImages: true,
      allowRemoteImages: false,
      html: '<img src="data:image/png;base64,iVBORw==">',
      origin: "https://mail.example.com",
      theme: "dark"
    });

    expect(blocked).toContain("img-src https://mail.example.com;");
    expect(blocked).toContain("font-src https://mail.example.com;");
    expect(blocked).toContain("font: small/1.5 Arial, Helvetica, sans-serif");
    expect(blocked).not.toContain("font-family: Inter");
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
    expect(signature).toContain("img-src https://mail.example.com data:");
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

    expect(html).toContain(
      "Remote images are hidden. Loading them may reveal that you opened this email."
    );
    expect(html).toContain("Load images");
    expect(html).toContain("Always load from this sender");
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("bg-muted/50");
    expect(html).toContain("sm:grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(html.match(/h-6 min-h-6/g)).toHaveLength(2);
  });

  it("warns only when a blocked remote image is in visible content", () => {
    const quoteOnly = {
      afterQuotedHtmlHasRemoteImages: false,
      htmlHasRemoteImages: false,
      quotedHtmlHasRemoteImages: true
    };

    expect(hasVisibleRemoteImages(quoteOnly, false)).toBe(false);
    expect(hasVisibleRemoteImages(quoteOnly, true)).toBe(true);
    expect(hasVisibleRemoteImages({ ...quoteOnly, htmlHasRemoteImages: true }, false)).toBe(true);
    expect(
      hasVisibleRemoteImages({ ...quoteOnly, afterQuotedHtmlHasRemoteImages: true }, false)
    ).toBe(true);
  });

  it("renders an accessible ellipsis disclosure for quoted history", () => {
    const html = renderToStaticMarkup(
      <QuotedContentDivider expanded={false} onToggle={() => undefined} />
    );

    expect(html).toContain('aria-label="Show quoted message history"');
    expect(html).toContain('aria-expanded="false"');
    expect(html.match(/data-quoted-content-dot/g)).toHaveLength(3);
    expect(html).toContain("print:hidden");
    expect(html).toContain("justify-start");
    expect(html).toContain("h-5 w-8");
    expect(html).toContain("bg-muted");
    expect(html).not.toContain("data-orientation");
  });

  it("keeps content after a collapsed quote in order and includes the quote when printing", () => {
    const html = renderToStaticMarkup(
      <MessageHtmlFrames
        afterQuote="<p>Inline answer below</p>"
        body="<p>Answer above</p>"
        bodyHasContent={true}
        onToggleQuote={() => undefined}
        quote="<p>Earlier reply</p>"
        quoteExpanded={false}
        subject="Hello"
      />
    );

    const body = html.indexOf("Message body: Hello");
    const control = html.indexOf("data-quoted-content-control");
    const quote = html.indexOf("Quoted message history: Hello");
    const afterQuote = html.indexOf("Message content after quote: Hello");
    expect(body).toBeGreaterThan(-1);
    expect(control).toBeGreaterThan(body);
    expect(quote).toBeGreaterThan(control);
    expect(afterQuote).toBeGreaterThan(quote);
    expect(html).toContain('class="hidden print:block"');
  });

  it("shows a quote directly when there is no content before it", () => {
    const html = renderToStaticMarkup(
      <MessageHtmlFrames
        afterQuote="<p>Footer</p>"
        body={null}
        bodyHasContent={false}
        onToggleQuote={() => undefined}
        quote="<p>Earlier reply</p>"
        quoteExpanded={false}
        subject="Hello"
      />
    );

    expect(html).not.toContain("data-quoted-content-control");
    expect(html).toContain('class="block"');
    expect(html).toContain("Quoted message history: Hello");
    expect(html).toContain("Message content after quote: Hello");
  });

  it("does not render an empty body frame before quoted history", () => {
    const html = renderToStaticMarkup(
      <MessageHtmlFrames
        afterQuote={null}
        body="<html><body><br></body></html>"
        bodyHasContent={false}
        onToggleQuote={() => undefined}
        quote="<p>Earlier reply</p>"
        quoteExpanded={false}
        subject="Hello"
      />
    );

    expect(html).not.toContain("Message body: Hello");
    expect(html).toContain("Quoted message history: Hello");
  });

  it("separates conventional plain-text reply history", () => {
    expect(
      splitQuotedText(
        "New reply\n\nOn 2026-07-28 at 15:29 UTC, owner@example.com wrote:\n\n> Earlier reply"
      )
    ).toEqual({
      afterQuote: null,
      body: "New reply",
      quote: "On 2026-07-28 at 15:29 UTC, owner@example.com wrote:\n\n> Earlier reply"
    });
  });

  it("does not depend on English attribution wording", () => {
    expect(
      splitQuotedText(
        "Neue Antwort\n\nAm Donnerstag schrieb Pat <pat@example.com>:\n\n> Frühere Antwort"
      )
    ).toEqual({
      afterQuote: null,
      body: "Neue Antwort",
      quote: "Am Donnerstag schrieb Pat <pat@example.com>:\n\n> Frühere Antwort"
    });
  });

  it("separates a wrapped plain-text attribution block", () => {
    expect(
      splitQuotedText(
        "New reply\n\nOn Thu, Aug 20, 2026 at 10:00 AM Pat <pat@example.com>\nwrote:\n> Earlier reply"
      )
    ).toEqual({
      afterQuote: null,
      body: "New reply",
      quote: "On Thu, Aug 20, 2026 at 10:00 AM Pat <pat@example.com>\nwrote:\n> Earlier reply"
    });
  });

  it("keeps authored text before a wrapped attribution without a blank line", () => {
    expect(
      splitQuotedText(
        "Reply text\nOn Thu, Aug 20, 2026 at 10:00 AM Pat <pat@example.com>\nwrote:\n> Earlier reply"
      )
    ).toEqual({
      afterQuote: null,
      body: "Reply text",
      quote: "On Thu, Aug 20, 2026 at 10:00 AM Pat <pat@example.com>\nwrote:\n> Earlier reply"
    });
  });

  it("separates an attribution wrapped before the sender", () => {
    expect(
      splitQuotedText(
        "New reply\n\nOn Thu, Aug 20, 2026 at 10:00 AM\nPat <pat@example.com> wrote:\n> Earlier reply"
      )
    ).toEqual({
      afterQuote: null,
      body: "New reply",
      quote: "On Thu, Aug 20, 2026 at 10:00 AM\nPat <pat@example.com> wrote:\n> Earlier reply"
    });
  });

  it("keeps a leading wrapped attribution visible when its boundary is ambiguous", () => {
    const value = "On Thu, Aug 20, 2026 at 10:00 AM\nPat <pat@example.com> wrote:\n> Earlier reply";

    expect(splitQuotedText(value)).toEqual({ afterQuote: null, body: value, quote: null });
  });

  it("keeps an authored plain-text quotation visible without a sender attribution", () => {
    const value = "Design note\n\nExample:\n\n> Authored quotation";
    expect(splitQuotedText(value)).toEqual({ afterQuote: null, body: value, quote: null });
  });

  it("keeps a plain-text inline answer after quoted history visible", () => {
    expect(
      splitQuotedText(
        "Answer above\n\nOn 2026-07-28 at 15:29 UTC, owner@example.com wrote:\n> Earlier reply\n\nAnswer below\n-- \nPat"
      )
    ).toEqual({
      afterQuote: "Answer below\n-- \nPat",
      body: "Answer above",
      quote: "On 2026-07-28 at 15:29 UTC, owner@example.com wrote:\n> Earlier reply"
    });
  });

  it("keeps whole-body plain-text history visible", () => {
    const value = "On 2026-07-28 at 15:29 UTC, owner@example.com wrote:\n> Earlier reply";
    expect(splitQuotedText(value)).toEqual({ afterQuote: null, body: value, quote: null });
  });
});
