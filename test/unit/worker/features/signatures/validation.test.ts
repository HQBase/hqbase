import {
  MAX_SIGNATURE_IMAGE_BYTES,
  sanitizeSignatureContent
} from "@worker/features/signatures/content";
import {
  createSignatureSchema,
  MAX_SIGNATURE_HTML_INPUT_LENGTH,
  updateSignatureSchema
} from "@worker/features/signatures/validation";
import { describe, expect, it } from "vitest";

const scope = { type: "user" as const, id: "user-1" };

describe("signature request validation", () => {
  it("accepts valid signature HTML with 256 KiB of decoded inline image data", () => {
    const bytes = new Uint8Array(MAX_SIGNATURE_IMAGE_BYTES);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const html = `<p>Logo</p><img alt="Logo" src="data:image/png;base64,${Buffer.from(bytes).toString("base64")}">`;

    expect(html.length).toBeGreaterThan(100_000);
    expect(() => sanitizeSignatureContent({ name: "Large image", html })).not.toThrow();
    expect(createSignatureSchema.safeParse({ name: "Large image", html, scope }).success).toBe(
      true
    );
    expect(updateSignatureSchema.safeParse({ html }).success).toBe(true);
  });

  it("keeps create and update requests bounded", () => {
    const html = "x".repeat(MAX_SIGNATURE_HTML_INPUT_LENGTH + 1);

    expect(createSignatureSchema.safeParse({ name: "Too large", html, scope }).success).toBe(false);
    expect(updateSignatureSchema.safeParse({ html }).success).toBe(false);
  });
});
