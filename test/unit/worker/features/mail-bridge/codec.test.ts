import { describe, expect, it } from "vitest";

import { decodeBase64, encodeBase64 } from "../../../../../worker/features/mail-bridge/codec";
import { parseUIDs } from "../../../../../worker/features/mail-bridge/mutations";

describe("mail bridge codec", () => {
  it("round-trips MIME bytes", () => {
    const source = new TextEncoder().encode("Subject: Test\r\n\r\nHello");
    expect(new Uint8Array(decodeBase64(encodeBase64(source)))).toEqual(source);
  });

  it("rejects malformed and oversized payloads", () => {
    expect(() => decodeBase64("not base64!", 100)).toThrow("valid base64");
    expect(() => decodeBase64("QUJDRA==", 2)).toThrow("exceeds");
  });
});

describe("IMAP UID sets", () => {
  it("expands bounded lists and ranges without duplicates", () => {
    expect(parseUIDs("1,3:5,4")).toEqual([1, 3, 4, 5]);
  });

  it("rejects invalid and unbounded targets", () => {
    expect(() => parseUIDs("0")).toThrow("UID set");
    expect(() => parseUIDs("1:20000")).toThrow("UID set");
  });
});
