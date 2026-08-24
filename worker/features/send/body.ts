import { AppError } from "../../lib/errors";
import type { SignatureSnapshot } from "../signatures/types";

export type MessageBodyPart = { html?: string | undefined; text: string };

export function assembleMessageBody(input: {
  authored: MessageBodyPart;
  signature?: SignatureSnapshot | undefined;
  context?: MessageBodyPart | undefined;
}): MessageBodyPart {
  const signature = input.signature?.text.trim() ? input.signature : undefined;
  const text = [input.authored.text.trim(), signature?.text.trim(), input.context?.text.trim()]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
  const needsHtml = Boolean(input.authored.html || signature?.html || input.context?.html);
  const html = needsHtml
    ? [
        input.authored.html?.trim() || textHtml(input.authored.text),
        signature?.html.trim(),
        input.context?.html?.trim() || (input.context ? textHtml(input.context.text) : undefined)
      ]
        .filter((part): part is string => Boolean(part))
        .join("<br><br>")
    : undefined;
  if (text.length > 100_000 || (html?.length ?? 0) > 200_000) {
    throw new AppError("MESSAGE_TOO_LARGE", "The assembled message is too large.", 413);
  }
  return { text, ...(html ? { html } : {}) };
}

function textHtml(value: string): string {
  const text = value.trim();
  return text ? `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>` : "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
