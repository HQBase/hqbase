import { createHash, randomBytes } from "node:crypto";
import { request as httpsRequest } from "node:https";

import { expect, test } from "@playwright/test";
import { ensureStagingSetup } from "./setup";

const accessClientId = required("HQBASE_STAGING_ACCESS_CLIENT_ID");
const accessClientSecret = required("HQBASE_STAGING_ACCESS_CLIENT_SECRET");
const email = required("HQBASE_STAGING_OWNER_EMAIL");
const password = required("HQBASE_STAGING_OWNER_PASSWORD");
const stagingUrl = required("HQBASE_STAGING_URL");
const maxErrorBodyBytes = 8_192;
const webSocketAcceptGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

type ProbeOutcome =
  | { kind: "open"; requestId: string | null }
  | {
      kind: "rejected";
      status: number;
      cfRay: string | null;
      requestId: string | null;
      appErrorCode: string | null;
    }
  | { kind: "invalid-handshake"; status: number; requestId: string | null }
  | { kind: "network-error"; code: string };

test("authenticated event WebSocket opens", async ({ page }) => {
  await ensureStagingSetup(page.context().request);
  const login = await page.context().request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: false },
    headers: { origin: stagingUrl }
  });
  expect(login.ok(), await login.text()).toBeTruthy();

  const cookies = await page.context().cookies(stagingUrl);
  const cookieHeader = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  expect(cookieHeader, "HQBase sign-in did not create a session cookie.").not.toBe("");

  const outcome = await probeEventWebSocket(cookieHeader);
  expect(outcome, `WebSocket upgrade failed: ${JSON.stringify(outcome)}`).toMatchObject({
    kind: "open",
    requestId: expect.any(String)
  });
});

function probeEventWebSocket(cookie: string): Promise<ProbeOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: ProbeOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const webSocketKey = randomBytes(16).toString("base64");
    const expectedAccept = createHash("sha1")
      .update(`${webSocketKey}${webSocketAcceptGuid}`)
      .digest("base64");
    const request = httpsRequest(new URL("/api/v2/events", stagingUrl), {
      method: "GET",
      headers: {
        connection: "Upgrade",
        cookie,
        "cf-access-client-id": accessClientId,
        "cf-access-client-secret": accessClientSecret,
        origin: new URL(stagingUrl).origin,
        "sec-websocket-key": webSocketKey,
        "sec-websocket-version": "13",
        upgrade: "websocket"
      }
    });

    request.once("upgrade", (response, socket) => {
      socket.destroy();
      if (
        response.statusCode !== 101 ||
        !headerHasToken(response.headers.upgrade, "websocket") ||
        !headerHasToken(response.headers.connection, "upgrade") ||
        firstHeader(response.headers["sec-websocket-accept"]) !== expectedAccept
      ) {
        finish({
          kind: "invalid-handshake",
          status: response.statusCode ?? 0,
          requestId: firstHeader(response.headers["x-request-id"])
        });
        return;
      }
      finish({ kind: "open", requestId: firstHeader(response.headers["x-request-id"]) });
    });
    request.once("response", (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk) => {
        if (size >= maxErrorBodyBytes) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const kept = bytes.subarray(0, maxErrorBodyBytes - size);
        chunks.push(kept);
        size += kept.length;
      });
      response.once("end", () => {
        finish({
          kind: "rejected",
          status: response.statusCode ?? 0,
          cfRay: firstHeader(response.headers["cf-ray"]),
          requestId: firstHeader(response.headers["x-request-id"]),
          appErrorCode: readAppErrorCode(Buffer.concat(chunks).toString("utf8"))
        });
      });
    });
    request.once("error", (error: Error & { code?: string }) => {
      finish({ kind: "network-error", code: error.code ?? error.name });
    });
    request.setTimeout(30_000, () => {
      request.destroy(
        Object.assign(new Error("WebSocket probe timed out."), { code: "ETIMEDOUT" })
      );
    });
    request.end();
  });
}

function firstHeader(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function headerHasToken(value: string | string[] | undefined, expected: string): boolean {
  return (Array.isArray(value) ? value : [value]).some((header) =>
    header
      ?.split(",")
      .map((token) => token.trim().toLowerCase())
      .includes(expected)
  );
}

function readAppErrorCode(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object") return null;
    const error = (parsed as { error?: unknown }).error;
    if (!error || typeof error !== "object") return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for staging E2E.`);
  return value;
}
