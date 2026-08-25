// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import {
  isSafeRasterImage,
  MAX_SIGNATURE_IMAGE_BYTES,
  referencedInlineAttachmentIds,
  signatureImagesFromFiles,
  signatureImageUsage
} from "@/features/compose/email-images";

const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("email image files", () => {
  it("validates raster bytes before it creates a signature data image", async () => {
    const file = new File([pngHeader], "logo.png", { type: "image/png" });

    await expect(isSafeRasterImage(file)).resolves.toBe(true);
    await expect(
      isSafeRasterImage(new File(["<svg/>"], "logo.png", { type: "image/png" }))
    ).resolves.toBe(false);
    await expect(
      isSafeRasterImage(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }))
    ).resolves.toBe(false);

    const [image] = await signatureImagesFromFiles([file], "<p>Regards</p>");
    expect(image).toEqual({
      alt: "logo.png",
      src: `data:image/png;base64,${btoa(String.fromCharCode(...pngHeader))}`
    });
    expect(signatureImageUsage(`<p>Regards</p><img alt="logo.png" src="${image?.src}">`)).toEqual({
      count: 1,
      bytes: pngHeader.byteLength
    });
  });

  it("enforces the signature image count and decoded byte limits", async () => {
    const file = new File([pngHeader], "logo.png", { type: "image/png" });
    const existing = Array.from(
      { length: 5 },
      () => '<img src="data:image/png;base64,iVBORw==">'
    ).join("");
    await expect(signatureImagesFromFiles([file], existing)).rejects.toThrow("up to 5 images");

    const tooLarge = new File([pngHeader, new Uint8Array(MAX_SIGNATURE_IMAGE_BYTES)], "large.png", {
      type: "image/png"
    });
    await expect(signatureImagesFromFiles([tooLarge], "<p>Regards</p>")).rejects.toThrow(
      "up to 256 KiB"
    );
  });

  it("finds only inline images that belong to the active draft", () => {
    expect(
      referencedInlineAttachmentIds(
        [
          '<img src="/api/v2/drafts/draft%201/attachments/image%201/inline">',
          '<img src="/api/v1/drafts/other/attachments/image-2/inline">',
          '<img src="https://tracker.example/pixel.png">'
        ].join(""),
        "draft 1"
      )
    ).toEqual(new Set(["image 1"]));
  });
});
