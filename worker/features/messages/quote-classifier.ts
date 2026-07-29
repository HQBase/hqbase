import sanitizeHtml from "sanitize-html";

export function splitQuotedHtml(
  html: string,
  subject: string
): { body: string; quote: string | null } {
  const match =
    /<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bgmail_quote(?:_container)?\b[^"]*"|'[^']*\bgmail_quote(?:_container)?\b[^']*')[^>]*>/i.exec(
      html
    );
  if (!match) return { body: html, quote: null };
  if (
    beginsWithForwardedMessage(html.slice(match.index)) &&
    (isForwardSubject(subject) || !visibleText(html.slice(0, match.index)))
  ) {
    return { body: html, quote: null };
  }
  if (match.index === 0) return { body: "", quote: html };
  return {
    body: html.slice(0, match.index).trimEnd(),
    quote: html.slice(match.index)
  };
}

function beginsWithForwardedMessage(html: string): boolean {
  return /^-{2,}\s*Forwarded message\s*-{2,}/i.test(visibleText(html.slice(0, 20_000)));
}

function isForwardSubject(subject: string): boolean {
  return /^\s*fw(?:d)?\s*:/i.test(subject);
}

function visibleText(html: string): string {
  return sanitizeHtml(html, {
    allowedAttributes: {},
    allowedTags: [],
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "noscript"]
  })
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
