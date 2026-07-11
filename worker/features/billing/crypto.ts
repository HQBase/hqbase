const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encryptLicenseKey(secret: string, licenseKey: string): Promise<string> {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(licenseKey)
  );
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

export async function decryptLicenseKey(secret: string, encryptedValue: string): Promise<string> {
  const [ivValue, ciphertextValue] = encryptedValue.split(".");
  if (!ivValue || !ciphertextValue) throw new Error("Invalid encrypted license value.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buffer(ivValue) },
    await encryptionKey(secret),
    buffer(ciphertextValue)
  );
  return decoder.decode(decrypted);
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function base64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function buffer(value: string): ArrayBuffer {
  const decoded = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength);
}
