import { hasChildren, isTag, isText, type Node } from "domhandler";
import { parseDocument } from "htmlparser2";
import sanitizeHtml from "sanitize-html";

import { AppError } from "../../lib/errors";
import { hasSafeInlineImageMagic, normalizedContentType } from "../messages/inline-media";

const blockTags = new Set(["div", "li", "ol", "p", "ul"]);
const maxSignatureImageCount = 5;
const maxSignatureImageDimension = 4096;
const maxSignatureMarkupLength = 20_000;
export const MAX_SIGNATURE_IMAGE_BYTES = 256 * 1024;
const maxSignatureImageBase64Length = Math.ceil(MAX_SIGNATURE_IMAGE_BYTES / 3) * 4;

export function parseSignatureDataImage(source: string): {
  bytes: Uint8Array;
  contentType: string;
} {
  if (source.length > maxSignatureImageBase64Length + 32) throw invalidSignature();
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(source);
  const contentType = match?.[1];
  const encoded = match?.[2];
  if (
    !contentType ||
    !encoded ||
    contentType !== normalizedContentType(contentType) ||
    encoded.length % 4 !== 0 ||
    encoded.length > maxSignatureImageBase64Length
  ) {
    throw invalidSignature();
  }

  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw invalidSignature();
  }
  if (
    binary.length === 0 ||
    binary.length > MAX_SIGNATURE_IMAGE_BYTES ||
    btoa(binary) !== encoded
  ) {
    throw invalidSignature();
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (!hasSafeInlineImageMagic(contentType, bytes)) throw invalidSignature();
  return { bytes, contentType };
}

export function sanitizeSignatureContent(input: { name: string; html: string }): {
  name: string;
  html: string;
  text: string;
} {
  const name = input.name.trim();
  let imageCount = 0;
  let imageBytes = 0;
  let imageSourceLength = 0;
  const html = sanitizeHtml(input.html, {
    allowedTags: ["p", "br", "strong", "em", "ol", "ul", "li", "a", "img"],
    allowedAttributes: { a: ["href"], img: ["src", "alt", "width", "height"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { a: ["http", "https", "mailto", "tel"], img: ["data"] },
    allowProtocolRelative: false,
    transformTags: {
      img: (_tagName, attributes) => {
        imageCount += 1;
        if (imageCount > maxSignatureImageCount) throw invalidSignature();
        const image = parseSignatureDataImage(attributes.src ?? "");
        imageBytes += image.bytes.byteLength;
        imageSourceLength += attributes.src?.length ?? 0;
        if (imageBytes > MAX_SIGNATURE_IMAGE_BYTES) throw invalidSignature();

        const safeAttributes: Record<string, string> = { src: attributes.src ?? "" };
        if (attributes.alt !== undefined) safeAttributes.alt = attributes.alt;
        for (const dimension of ["width", "height"] as const) {
          const value = boundedImageDimension(attributes[dimension]);
          if (value) safeAttributes[dimension] = value;
        }
        return { tagName: "img", attribs: safeAttributes };
      }
    }
  }).trim();
  const text = signaturePlainText(html);
  if (
    name.length === 0 ||
    [...name].length > 80 ||
    html.length - imageSourceLength > maxSignatureMarkupLength ||
    text.length === 0 ||
    text.length > 10_000
  ) {
    throw invalidSignature();
  }
  return { name, html, text };
}

export function signaturePlainText(html: string): string {
  const output: string[] = [];
  const visit = (node: Node): void => {
    if (isText(node)) {
      output.push(node.data);
      return;
    }
    if (isTag(node) && node.name === "br") output.push("\n");
    if (isTag(node) && node.name === "li") output.push("- ");
    if (isTag(node) && node.name === "img" && node.attribs.alt?.trim()) {
      output.push(` ${node.attribs.alt.trim()} `);
    }
    if (hasChildren(node)) node.children.forEach(visit);
    if (isTag(node) && blockTags.has(node.name)) output.push("\n");
  };
  parseDocument(html).children.forEach(visit);
  return output
    .join("")
    .replaceAll("\u00a0", " ")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function boundedImageDimension(value: string | undefined): string | null {
  if (!value || !/^\d+$/u.test(value)) return null;
  const dimension = Number(value);
  return dimension >= 1 && dimension <= maxSignatureImageDimension ? String(dimension) : null;
}

function invalidSignature(): AppError {
  return new AppError(
    "SIGNATURE_INVALID",
    "Signature name or content does not meet the content rules.",
    400
  );
}
