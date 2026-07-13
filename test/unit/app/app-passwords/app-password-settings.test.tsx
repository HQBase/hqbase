import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppPasswordSettings } from "@/features/app-passwords/app-password-settings";

describe("mail-client settings", () => {
  it("labels IMAP and SMTP as a private preview", () => {
    const html = renderToStaticMarkup(<AppPasswordSettings />);

    expect(html).toContain("Private preview");
    expect(html).toContain("basic Pro launch is web-first");
    expect(html).toContain("not generally available yet");
  });
});
