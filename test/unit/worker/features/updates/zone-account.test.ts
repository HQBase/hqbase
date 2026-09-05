import { findZoneAccount } from "@worker/features/updates/zone-account";
import { expect, it, vi } from "vitest";

it("finds the most specific accessible zone after the first 50 zones", async () => {
  const first = Array.from({ length: 49 }, (_, index) => ({
    name: `zone${index}.example`,
    account: { id: "other" }
  }));
  first.push({ name: "example.com", account: { id: "parent" } });
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, result: first, result_info: { total_pages: 2 } })
    )
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        result: [{ name: "mail.example.com", account: { id: "workspace" } }],
        result_info: { total_pages: 2 }
      })
    );
  await expect(findZoneAccount("app.mail.example.com", {}, request)).resolves.toBe("workspace");
  expect(request.mock.calls[1]?.[0]).toContain("page=2");
});
