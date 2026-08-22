const prefix = "hqb_pat_";
const tokenPattern = /^hqb_pat_[A-Za-z0-9_-]{43}$/u;
const encoder = new TextEncoder();

export async function generatePersonalAccessToken(): Promise<{
  token: string;
  tokenHash: string;
  tokenSuffix: string;
}> {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const token = `${prefix}${base64Url(secret)}`;
  return {
    token,
    tokenHash: await hashPersonalAccessToken(token),
    tokenSuffix: token.slice(-4)
  };
}

export function parsePersonalAccessToken(value: string): string {
  if (!tokenPattern.test(value)) throw new Error("Personal access token is malformed.");
  const encoded = value.slice(prefix.length);
  const decoded = fromBase64Url(encoded);
  if (decoded.length !== 32 || base64Url(decoded) !== encoded) {
    throw new Error("Personal access token is malformed.");
  }
  return value;
}

export async function hashPersonalAccessToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64Url(new Uint8Array(digest));
}

function base64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
