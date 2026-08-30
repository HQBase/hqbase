import { splitQuotedText } from "../../../shared/message-quote";
import type { MessageDetail } from "../messages/types";
import { assembleMessageBody } from "./body";

const maxQuotedCharacters = 100_000;
const truncationNotice = "[Previous message truncated by HQBase]";

type ReplySource = Pick<
  MessageDetail,
  "createdAt" | "fromAddress" | "fromName" | "receivedAt" | "sentAt" | "snippet" | "textBody"
>;

export function buildReplyBody(
  authored: { html?: string | undefined; text: string },
  original: ReplySource,
  richQuoteHtml?: string
): { html?: string | undefined; text: string } {
  const context = buildReplyContext(
    original,
    richQuoteHtml,
    maxQuotedCharacters - authored.text.trim().length - 2
  );
  return assembleMessageBody({
    authored,
    context: authored.html ? context : { text: context.text }
  });
}

export function buildReplyContext(
  original: ReplySource,
  richQuoteHtml?: string,
  maxTextLength = maxQuotedCharacters
): { html: string; text: string } {
  const attribution = `On ${formatTimestamp(
    original.receivedAt ?? original.sentAt ?? original.createdAt
  )}, ${senderLabel(original)} wrote:`;
  const source = original.textBody || original.snippet;
  let sourceLimit = Math.max(
    0,
    Math.min(maxQuotedCharacters, maxTextLength - attribution.length - 2)
  );
  let quoted = boundedQuoteSource(source, sourceLimit);
  let text = `${attribution}\n${quotePlainText(quoted)}`;
  while (text.length > maxTextLength && sourceLimit > 0) {
    sourceLimit = Math.max(0, sourceLimit - (text.length - maxTextLength) - 1);
    quoted = boundedQuoteSource(source, sourceLimit);
    text = `${attribution}\n${quotePlainText(quoted)}`;
  }
  return {
    text,
    html: quoteHtml(attribution, richQuoteHtml ?? plainTextHtml(quoted))
  };
}

export function buildReplyChainContext(
  messages: ReplySource[],
  richLatestHtml?: string,
  maxTextLength = maxQuotedCharacters
): { html: string; text: string } {
  const oldest = messages[0];
  const latest = messages.at(-1);
  if (!oldest || !latest) throw new Error("A reply chain needs at least one message.");

  let nestedText = messageText(oldest);
  let nestedHtml =
    messages.length === 1 && richLatestHtml ? richLatestHtml : plainTextHtml(nestedText);
  for (let index = 1; index < messages.length; index += 1) {
    const current = messages[index];
    const previous = messages[index - 1];
    if (!current || !previous) continue;
    const currentText = authoredMessageText(current);
    const attribution = replyAttribution(previous);
    nestedText = joinText(currentText, `${attribution}\n${quotePlainText(nestedText)}`);
    nestedHtml = joinHtml(
      index === messages.length - 1 && richLatestHtml ? richLatestHtml : plainTextHtml(currentText),
      quoteHtml(attribution, nestedHtml)
    );
  }

  return buildReplyContext(
    { ...latest, snippet: nestedText, textBody: nestedText },
    nestedHtml,
    maxTextLength
  );
}

function messageText(message: ReplySource): string {
  return (message.textBody || message.snippet).replace(/\r\n?/g, "\n").trim();
}

function authoredMessageText(message: ReplySource): string {
  const source = messageText(message);
  const parts = splitQuotedText(source);
  return joinText(parts.body, parts.afterQuote ?? "") || source;
}

function joinText(...parts: string[]): string {
  return parts.filter((part) => part.trim()).join("\n\n");
}

function joinHtml(...parts: string[]): string {
  return parts.filter(Boolean).join("<br><br>");
}

function replyAttribution(message: ReplySource): string {
  return `On ${formatTimestamp(
    message.receivedAt ?? message.sentAt ?? message.createdAt
  )}, ${senderLabel(message)} wrote:`;
}

function senderLabel(message: Pick<ReplySource, "fromAddress" | "fromName">): string {
  return message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress;
}

function boundedQuoteSource(value: string, limit = maxQuotedCharacters): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= limit) return normalized;
  if (limit <= truncationNotice.length) return truncationNotice.slice(0, limit);
  return `${normalized.slice(0, limit - truncationNotice.length - 2).trimEnd()}\n\n${truncationNotice}`;
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
