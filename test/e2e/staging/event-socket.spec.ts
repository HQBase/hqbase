import { expect, test } from "@playwright/test";

const email = required("HQBASE_STAGING_OWNER_EMAIL");
const password = required("HQBASE_STAGING_OWNER_PASSWORD");
const stagingUrl = required("HQBASE_STAGING_URL");

test("authenticated event WebSocket opens", async ({ page }) => {
  const login = await page.context().request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: false },
    headers: { origin: stagingUrl }
  });
  expect(login.ok(), await login.text()).toBeTruthy();

  await page.goto("/offline.html", { waitUntil: "domcontentloaded" });
  const outcome = await page.evaluate(
    () =>
      new Promise<"failed" | "open">((resolve) => {
        const url = new URL("/api/v2/events", window.location.href);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(url);
        let finished = false;
        const finish = (value: "failed" | "open"): void => {
          if (finished) return;
          finished = true;
          socket.close();
          resolve(value);
        };
        socket.addEventListener("open", () => finish("open"));
        socket.addEventListener("error", () => finish("failed"));
        socket.addEventListener("close", () => finish("failed"));
        window.setTimeout(() => finish("failed"), 30_000);
      })
  );

  expect(outcome).toBe("open");
});

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for staging E2E.`);
  return value;
}
