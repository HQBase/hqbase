import { readJson } from "@worker/lib/json";
import { readBoundedBody } from "@worker/lib/request-body";
import { describe, expect, it, vi } from "vitest";

describe("bounded request parsing", () => {
  it("stops an oversized stream without a Content-Length header", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(4));
      },
      cancel
    });
    const request = new Request("https://hqbase.test", {
      method: "POST",
      body,
      duplex: "half"
    } as RequestInit);
    await expect(readBoundedBody(request, 6)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects a non-JSON media type before parsing", async () => {
    await expect(
      readJson(
        new Request("https://hqbase.test", {
          method: "POST",
          body: "{}",
          headers: { "content-type": "text/plain" }
        })
      )
    ).rejects.toMatchObject({ status: 415 });
  });
});
