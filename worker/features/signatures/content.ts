import { hasChildren, isTag, isText, type Node } from "domhandler";
import { parseDocument } from "htmlparser2";
import sanitizeHtml from "sanitize-html";

import { AppError } from "../../lib/errors";

const blockTags = new Set(["div", "li", "ol", "p", "ul"]);

export function sanitizeSignatureContent(input: { name: string; html: string }): {
  name: string;
  html: string;
  text: string;
} {
  const name = input.name.trim();
  const html = sanitizeHtml(input.html, {
    allowedTags: ["p", "br", "strong", "em", "ol", "ul", "li", "a"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { a: ["http", "https", "mailto", "tel"] },
    allowProtocolRelative: false
  }).trim();
  const text = signaturePlainText(html);
  if (
    name.length === 0 ||
    [...name].length > 80 ||
    html.length > 20_000 ||
    text.length === 0 ||
    text.length > 10_000
  ) {
    throw new AppError(
      "SIGNATURE_INVALID",
      "Signature name or content does not meet the content rules.",
      400
    );
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
