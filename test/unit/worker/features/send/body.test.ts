import { assembleMessageBody } from "@worker/features/send/body";
import { describe, expect, it } from "vitest";

const signature = {
  mode: "selected" as const,
  id: "sig_support",
  name: "Support",
  text: "Jane\nSupport",
  html: "<p>Jane<br>Support</p>"
};

describe("outgoing body assembly", () => {
  it("assembles authored content, one signature, then context", () => {
    const body = assembleMessageBody({
      authored: { text: "Thanks", html: "<p>Thanks</p>" },
      signature,
      context: { text: "> Earlier", html: "<blockquote>Earlier</blockquote>" }
    });

    expect(body.text).toBe("Thanks\n\nJane\nSupport\n\n> Earlier");
    expect(body.html).toBe(
      "<p>Thanks</p><br><br><p>Jane<br>Support</p><br><br><blockquote>Earlier</blockquote>"
    );
  });

  it("creates HTML when a text-only request selects a rich signature", () => {
    expect(assembleMessageBody({ authored: { text: "Hello" }, signature })).toEqual({
      text: "Hello\n\nJane\nSupport",
      html: "<p>Hello</p><br><br><p>Jane<br>Support</p>"
    });
  });

  it("leaves an omitted signature unchanged", () => {
    expect(assembleMessageBody({ authored: { text: "Hello" } })).toEqual({ text: "Hello" });
  });
});
