import {
  MAX_SIGNATURE_IMAGE_BYTES,
  parseSignatureDataImage,
  sanitizeSignatureContent,
  signaturePlainText
} from "@worker/features/signatures/content";
import { describe, expect, it } from "vitest";

describe("signature content", () => {
  it("keeps supported rich text and removes active content", () => {
    const content = sanitizeSignatureContent({
      name: "  Support standard  ",
      html: [
        '<p onclick="alert(1)"><strong>Jane</strong><br><em>Support</em></p>',
        '<a href="https://example.com">Website</a>',
        '<a href="javascript:alert(1)">Unsafe</a>',
        "<script>alert(1)</script>"
      ].join("")
    });

    expect(content.name).toBe("Support standard");
    expect(content.html).toContain("<strong>Jane</strong>");
    expect(content.html).toContain('href="https://example.com"');
    expect(content.html).not.toMatch(/onclick|javascript|<script/iu);
    expect(content.text).toBe("Jane\nSupport\nWebsiteUnsafe");
  });

  it("keeps validated raster data images and useful display attributes", () => {
    for (const [contentType, bytes] of Object.entries(imageMagic)) {
      expect(parseSignatureDataImage(dataImage(contentType, bytes))).toEqual({
        bytes: Uint8Array.from(bytes),
        contentType
      });
    }

    const source = dataImage("image/png", imageMagic["image/png"]);
    const content = sanitizeSignatureContent({
      name: "Image signature",
      html: `<p><img src="${source}" alt="Acme logo" width="0120" height="4096" class="x"></p>`
    });

    expect(content.html).toContain(`src="${source}"`);
    expect(content.html).toContain('alt="Acme logo"');
    expect(content.html).toContain('width="120"');
    expect(content.html).toContain('height="4096"');
    expect(content.html).not.toContain("class=");
    expect(content.text).toBe("Acme logo");
  });

  it("removes invalid image dimensions", () => {
    const source = dataImage("image/png", imageMagic["image/png"]);
    const content = sanitizeSignatureContent({
      name: "Bounded image",
      html: `<img src="${source}" alt="Logo" width="0" height="4097">`
    });

    expect(content.html).not.toMatch(/width=|height=/u);
  });

  it("rejects unsafe, malformed, noncanonical, and mismatched image sources", () => {
    const png = dataImage("image/png", imageMagic["image/png"]);
    const invalidSources = [
      "https://example.com/logo.png",
      "blob:https://example.com/id",
      dataImage("image/svg+xml", [0x3c, 0x73, 0x76, 0x67, 0x3e]),
      png.replace(";base64,", ";base64,%"),
      png.replace(/o=$/u, "p="),
      dataImage("IMAGE/PNG", imageMagic["image/png"]),
      dataImage("image/avif", imageMagic["image/avif"].slice(0, 12)),
      dataImage("image/jpeg", imageMagic["image/png"])
    ];

    for (const source of invalidSources) {
      expect(() =>
        sanitizeSignatureContent({ name: "Unsafe image", html: `<img src="${source}" alt="Logo">` })
      ).toThrowError(expect.objectContaining({ code: "SIGNATURE_INVALID" }));
    }
  });

  it("limits image count and decoded bytes", () => {
    const small = dataImage("image/png", imageMagic["image/png"]);
    expect(() =>
      sanitizeSignatureContent({
        name: "Too many images",
        html: Array.from(
          { length: 6 },
          (_, index) => `<img src="${small}" alt="Logo ${index + 1}">`
        ).join("")
      })
    ).toThrowError(expect.objectContaining({ code: "SIGNATURE_INVALID" }));

    const largeBytes = new Uint8Array(MAX_SIGNATURE_IMAGE_BYTES / 2 + 1);
    largeBytes.set(imageMagic["image/png"]);
    const large = dataImage("image/png", largeBytes);
    expect(() =>
      sanitizeSignatureContent({
        name: "Images too large",
        html: `<img src="${large}" alt="One"><img src="${large}" alt="Two">`
      })
    ).toThrowError(expect.objectContaining({ code: "SIGNATURE_INVALID" }));

    const oversizedBytes = new Uint8Array(MAX_SIGNATURE_IMAGE_BYTES + 1);
    oversizedBytes.set(imageMagic["image/png"]);
    expect(() => parseSignatureDataImage(dataImage("image/png", oversizedBytes))).toThrowError(
      expect.objectContaining({ code: "SIGNATURE_INVALID" })
    );
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

const imageMagic = {
  "image/avif": [
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00,
    0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x66, 0x31
  ],
  "image/gif": [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/webp": [0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]
} as const;

function dataImage(contentType: string, bytes: ArrayLike<number>): string {
  return `data:${contentType};base64,${btoa(
    Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
  )}`;
}
