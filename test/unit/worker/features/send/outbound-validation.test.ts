import { sendMessageSchema } from "@worker/features/send/validation";
import { describe, expect, it } from "vitest";

describe("sendMessageSchema", () => {
  it("accepts a valid outbound message", () => {
    const parsed = sendMessageSchema.parse({
      from: "hello@example.com",
      to: ["alice@example.net"],
      cc: [],
      bcc: [],
      subject: "Hello",
      text: "Plain text body"
    });

    expect(parsed.from).toBe("hello@example.com");
  });

  it("requires at least one recipient", () => {
    expect(() =>
      sendMessageSchema.parse({
        from: "hello@example.com",
        to: [],
        subject: "Hello",
        text: "Plain text body"
      })
    ).toThrow();
  });

  it("enforces the Cloudflare combined recipient limit", () => {
    const recipients = Array.from({ length: 50 }, (_, index) => `user${index}@example.net`);

    expect(() =>
      sendMessageSchema.parse({
        from: "hello@example.com",
        to: recipients,
        cc: ["extra@example.net"],
        bcc: [],
        subject: "Hello",
        text: "Plain text body"
      })
    ).toThrow("Cloudflare Email Sending allows up to 50 total recipients.");
  });
});
