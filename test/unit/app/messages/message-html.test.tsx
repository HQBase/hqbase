import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildEmailHtmlDocument } from "@/features/messages/html-document";
import { RemoteImagesAlert } from "@/features/messages/message-html";

describe("message HTML view", () => {
  it("keeps remote origins out of the iframe policy until images are loaded", () => {
    const blocked = buildEmailHtmlDocument({
      allowRemoteImages: false,
      html: "<strong>Hello</strong>",
      origin: "https://mail.example.com"
    });
    const loaded = buildEmailHtmlDocument({
      allowRemoteImages: true,
      html: "<strong>Hello</strong>",
      origin: "https://mail.example.com"
    });

    expect(blocked).toContain("img-src https://mail.example.com;");
    expect(blocked).toContain("font-src https://mail.example.com;");
    expect(blocked).toContain('font-family: "Geist Sans"');
    expect(blocked).toContain('url("/fonts/Geist-Regular.woff2")');
    expect(blocked).not.toContain("https: http:");
    expect(loaded).toContain("img-src https://mail.example.com https: http:");
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
});
