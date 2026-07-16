const COOKIE_NAME = "hqb_pro_upgrade";
const COOKIE_TTL_SECONDS = 24 * 60 * 60;

export type UpgradeDraft = {
  upgradeId: string;
  nonce?: string;
  verifier?: string;
  licenseKey?: string;
  orchestrationSecret?: string;
  cloudflareVerifier?: string;
  cloudflareState?: string;
  cloudflareAccessToken?: string;
};

export type UpgradeContinuation = {
  upgradeId: string;
  licenseKey: string;
  orchestrationSecret?: string;
};

export async function readUpgradeDraft(
  request: Request,
  betterAuthSecret: string
): Promise<UpgradeDraft | null> {
  const encrypted = parseCookies(request.headers.get("cookie")).get(COOKIE_NAME);
  if (!encrypted) return null;
  try {
    return JSON.parse(await decrypt(encrypted, betterAuthSecret)) as UpgradeDraft;
  } catch {
    return null;
  }
}

export async function writeUpgradeDraft(
  draft: UpgradeDraft,
  betterAuthSecret: string
): Promise<string> {
  return secureCookie(
    COOKIE_NAME,
    await encrypt(JSON.stringify(draft), betterAuthSecret),
    COOKIE_TTL_SECONDS
  );
}

export async function sealUpgradeContinuation(
  continuation: UpgradeContinuation,
  betterAuthSecret: string
): Promise<string> {
  return encrypt(JSON.stringify(continuation), betterAuthSecret);
}

export async function openUpgradeContinuation(
  ciphertext: string,
  betterAuthSecret: string
): Promise<UpgradeContinuation> {
  return JSON.parse(await decrypt(ciphertext, betterAuthSecret)) as UpgradeContinuation;
}

async function encrypt(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(secret, ["encrypt"]),
    new TextEncoder().encode(value)
  );
  return `${base64Url(iv)}.${base64Url(ciphertext)}`;
}

async function decrypt(value: string, secret: string): Promise<string> {
  const [rawIv, rawCiphertext] = value.split(".");
  if (!rawIv || !rawCiphertext) throw new Error("Invalid upgrade draft.");
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(rawIv).buffer as ArrayBuffer },
    await key(secret, ["decrypt"]),
    fromBase64Url(rawCiphertext).buffer as ArrayBuffer
  );
  return new TextDecoder().decode(clear);
}

async function key(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`hqbase-community-pro-upgrade:${secret}`)
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, usages);
}

function parseCookies(value: string | null): Map<string, string> {
  return new Map(
    (value ?? "")
      .split(";")
      .map((part) => part.trim().split("=", 2))
      .filter((entry): entry is [string, string] => entry.length === 2)
      .map(([name, content]) => [name, decodeURIComponent(content)])
  );
}

function secureCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function base64Url(value: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
