import { hasSafeInlineImageMagic, isSafeInlineImage } from "@worker/features/messages/inline-media";
import { describe, expect, it } from "vitest";

describe("inline message media", () => {
  it("allows safe raster images and rejects active or unrelated content", () => {
    expect(isSafeInlineImage("image/png; charset=binary")).toBe(true);
    expect(isSafeInlineImage("image/jpeg")).toBe(true);
    expect(isSafeInlineImage("image/svg+xml")).toBe(false);
    expect(isSafeInlineImage("text/html")).toBe(false);
  });

  it("matches each allowlisted MIME type to its raster file signature", () => {
    for (const [contentType, bytes] of Object.entries(imageMagic)) {
      expect(hasSafeInlineImageMagic(contentType, Uint8Array.from(bytes))).toBe(true);
    }

    expect(
      hasSafeInlineImageMagic(
        " IMAGE/PNG; charset=binary ",
        Uint8Array.from(imageMagic["image/png"])
      )
    ).toBe(true);
    expect(hasSafeInlineImageMagic("image/jpeg", Uint8Array.from(imageMagic["image/png"]))).toBe(
      false
    );
    expect(hasSafeInlineImageMagic("image/svg+xml", Uint8Array.from(imageMagic["image/png"]))).toBe(
      false
    );

    const truncatedAvif = Uint8Array.from(imageMagic["image/avif"].slice(0, 12));
    expect(hasSafeInlineImageMagic("image/avif", truncatedAvif)).toBe(false);
    expect(hasSafeInlineImageMagic("image/avif", truncatedAvif, 24)).toBe(true);
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
