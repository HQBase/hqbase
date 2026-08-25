export const EMAIL_IMAGE_ACCEPT = "image/avif,image/gif,image/jpeg,image/png,image/webp";
export const MAX_SIGNATURE_IMAGE_COUNT = 5;
export const MAX_SIGNATURE_IMAGE_BYTES = 256 * 1024;

const safeImageTypes = new Set(EMAIL_IMAGE_ACCEPT.split(","));

export type RichEmailImage = {
  src: string;
  alt: string;
};

export function referencedInlineAttachmentIds(html: string, draftId: string): Set<string> {
  const ids = new Set<string>();
  const document = new DOMParser().parseFromString(html, "text/html");
  for (const image of document.querySelectorAll("img[src]")) {
    const match = /^\/api\/v[12]\/drafts\/([^/?#]+)\/attachments\/([^/?#]+)\/inline$/u.exec(
      image.getAttribute("src") ?? ""
    );
    if (!match) continue;
    try {
      if (decodeURIComponent(match[1] ?? "") === draftId) {
        ids.add(decodeURIComponent(match[2] ?? ""));
      }
    } catch {
      // Ignore malformed private image URLs.
    }
  }
  return ids;
}

export async function isSafeRasterImage(file: File): Promise<boolean> {
  const contentType = file.type.toLowerCase();
  if (!safeImageTypes.has(contentType)) return false;
  const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  if (contentType === "image/png") {
    return hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (contentType === "image/jpeg") return hasBytes(bytes, 0, [0xff, 0xd8, 0xff]);
  if (contentType === "image/gif") {
    return hasAscii(bytes, 0, "GIF87a") || hasAscii(bytes, 0, "GIF89a");
  }
  if (contentType === "image/webp") {
    return hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WEBP");
  }
  if (!hasAscii(bytes, 4, "ftyp")) return false;
  const boxSize =
    (((bytes[0] ?? 0) << 24) |
      ((bytes[1] ?? 0) << 16) |
      ((bytes[2] ?? 0) << 8) |
      (bytes[3] ?? 0)) >>>
    0;
  if (boxSize < 16 || boxSize > bytes.length) return false;
  for (let offset = 8; offset + 4 <= boxSize; offset += offset === 8 ? 8 : 4) {
    if (hasAscii(bytes, offset, "avif") || hasAscii(bytes, offset, "avis")) return true;
  }
  return false;
}

export async function signatureImagesFromFiles(
  files: File[],
  currentHtml: string
): Promise<RichEmailImage[]> {
  const current = signatureImageUsage(currentHtml);
  if (current.count + files.length > MAX_SIGNATURE_IMAGE_COUNT) {
    throw new Error(`A signature can contain up to ${MAX_SIGNATURE_IMAGE_COUNT} images.`);
  }
  const addedBytes = files.reduce((total, file) => total + file.size, 0);
  if (current.bytes + addedBytes > MAX_SIGNATURE_IMAGE_BYTES) {
    throw new Error("Signature images can use up to 256 KiB in total.");
  }
  if (!(await Promise.all(files.map(isSafeRasterImage))).every(Boolean)) {
    throw new Error("Use AVIF, GIF, JPEG, PNG, or WebP image files.");
  }
  return Promise.all(
    files.map(async (file) => ({ alt: file.name || "Image", src: await readDataUrl(file) }))
  );
}

export function signatureImageUsage(html: string): { count: number; bytes: number } {
  const document = new DOMParser().parseFromString(html, "text/html");
  const images = Array.from(document.querySelectorAll("img"));
  return {
    count: images.length,
    bytes: images.reduce((total, image) => total + dataUrlByteLength(image.getAttribute("src")), 0)
  };
}

function dataUrlByteLength(source: string | null): number {
  const encoded = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(
    source ?? ""
  )?.[1];
  if (!encoded || encoded.length % 4 !== 0) return 0;
  return (encoded.length / 4) * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Image could not be read."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Image could not be read."));
    reader.readAsDataURL(file);
  });
}

function hasAscii(bytes: Uint8Array, offset: number, value: string): boolean {
  return hasBytes(
    bytes,
    offset,
    Array.from(value, (character) => character.charCodeAt(0))
  );
}

function hasBytes(bytes: Uint8Array, offset: number, values: number[]): boolean {
  return values.every((value, index) => bytes[offset + index] === value);
}
