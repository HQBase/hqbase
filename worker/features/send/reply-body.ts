import type { MessageDetail } from "../messages/types";

const maxQuotedCharacters = 100_000;
const truncationNotice = "[Previous message truncated by HQBase]";

type ReplySource = Pick<
  MessageDetail,
  "createdAt" | "fromAddress" | "receivedAt" | "sentAt" | "snippet" | "textBody"
>;

export function buildReplyBody(
  authored: { html?: string | undefined; text: string },
  original: ReplySource,
  richQuoteHtml?: string
): { html?: string | undefined; text: string } {
  const attribution = `On ${formatTimestamp(
    original.receivedAt ?? original.sentAt ?? original.createdAt
  )}, ${original.fromAddress} wrote:`;
  const quoted = boundedQuoteSource(original.textBody || original.snippet);
  const text = `${authored.text.trimEnd()}\n\n${attribution}\n${quotePlainText(quoted)}`;

  if (!authored.html) return { text };

  return {
    text,
    html: `${authored.html.trimEnd()}${quoteHtml(attribution, richQuoteHtml ?? plainTextHtml(quoted))}`
  };
}

function boundedQuoteSource(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= maxQuotedCharacters) return normalized;
  return `${normalized.slice(0, maxQuotedCharacters).trimEnd()}\n\n${truncationNotice}`;
}

function quotePlainText(value: string): string {
  return value
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

function plainTextHtml(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function quoteHtml(attribution: string, quotedHtml: string): string {
  return [
    '<div class="gmail_quote gmail_quote_container">',
    `<div dir="ltr" class="gmail_attr"><br>${escapeHtml(attribution)}<br></div>`,
    '<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">',
    quotedHtml,
    "</blockquote>",
    "</div>"
  ].join("");
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const [day, time = ""] = date.toISOString().split("T");
  return `${day} at ${time.slice(0, 5)} UTC`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
