import { expect, it, vi } from "vitest";
import { fetchPublicAsset } from "../../../scripts/release/public-assets.mjs";

it("waits for published assets without retrying permission failures", async () => {
  const sleep = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response("ready"));
  expect(await (await fetchPublicAsset("https://example.com", { fetcher, sleep })).text()).toBe(
    "ready"
  );
  expect(sleep).toHaveBeenCalledTimes(1);
  const denied = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
  expect((await fetchPublicAsset("https://example.com", { fetcher: denied, sleep })).status).toBe(
    403
  );
  expect(denied).toHaveBeenCalledTimes(1);
});
it("stops after bounded publication retries", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
  await expect(
    fetchPublicAsset("https://example.com", { fetcher, sleep: vi.fn() })
  ).rejects.toThrow("did not become available");
  expect(fetcher).toHaveBeenCalledTimes(30);
});
