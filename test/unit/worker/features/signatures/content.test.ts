import { sanitizeSignatureContent, signaturePlainText } from "@worker/features/signatures/content";
import { describe, expect, it } from "vitest";

describe("signature content", () => {
  it("keeps supported rich text and removes active or remote content", () => {
    const content = sanitizeSignatureContent({
      name: "  Support standard  ",
      html: [
        '<p onclick="alert(1)"><strong>Jane</strong><br><em>Support</em></p>',
        '<a href="https://example.com">Website</a>',
        '<a href="javascript:alert(1)">Unsafe</a>',
        '<img src="https://example.com/tracker.png">',
        "<script>alert(1)</script>"
      ].join("")
    });

    expect(content.name).toBe("Support standard");
    expect(content.html).toContain("<strong>Jane</strong>");
    expect(content.html).toContain('href="https://example.com"');
    expect(content.html).not.toMatch(/onclick|javascript|<img|<script/iu);
    expect(content.text).toBe("Jane\nSupport\nWebsiteUnsafe");
  });

  it("creates readable plain text for lists", () => {
    expect(signaturePlainText("<p>Hello</p><ul><li>One</li><li>Two</li></ul>")).toBe(
      "Hello\n- One\n- Two"
    );
  });

  it("rejects empty visible content", () => {
    expect(() => sanitizeSignatureContent({ name: "Empty", html: "<p><br></p>" })).toThrowError(
      expect.objectContaining({ code: "SIGNATURE_INVALID" })
    );
  });
});
