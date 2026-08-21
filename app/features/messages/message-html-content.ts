export function hasMessageHtmlContent(value: string): boolean {
  if (!value) return false;
  if (typeof DOMParser === "undefined") return true;

  const document = new DOMParser().parseFromString(value, "text/html");
  if ((document.body.textContent?.trim() ?? "").length > 0) return true;
  if (document.body.querySelector("img, video, svg, a, table, .proton-image-anchor")) return true;
  return Array.from(document.body.querySelectorAll("[style]")).some((element) =>
    element.getAttribute("style")?.includes("url(")
  );
}

export function splitQuotedText(value: string): {
  afterQuote: string | null;
  body: string;
  quote: string | null;
} {
  const normalized = value.replace(/\r\n?/g, "\n");
  const quoteStart = findPlainTextQuoteStart(normalized);
  if (quoteStart === null) return { afterQuote: null, body: value, quote: null };

  const body = normalized.slice(0, quoteStart).trimEnd();
  const quotedTail = normalized.slice(quoteStart).trim();
  const lines = quotedTail.split("\n");
  let sawQuotedLine = false;
  let quoteEnd = lines.length;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trimStart().startsWith(">")) {
      sawQuotedLine = true;
      continue;
    }
    if (!line.trim()) continue;
    if (sawQuotedLine) {
      quoteEnd = index;
      break;
    }
  }

  const quote = lines.slice(0, quoteEnd).join("\n").trim();
  const afterQuote = lines.slice(quoteEnd).join("\n").trim();
  if (!body && !afterQuote) return { afterQuote: null, body: normalized, quote: null };
  return {
    afterQuote: afterQuote || null,
    body,
    quote
  };
}

const plainTextEmailAddress = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/iu;

function findPlainTextQuoteStart(value: string): number | null {
  const lines = value.split("\n");
  let offset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const attribution = line.trim();
    if (attribution.endsWith(":") && plainTextEmailAddress.test(attribution)) {
      let quoteLine = index + 1;
      while (quoteLine < lines.length && !(lines[quoteLine] ?? "").trim()) quoteLine += 1;
      if ((lines[quoteLine] ?? "").trimStart().startsWith(">")) return offset;
    }
    offset += line.length + 1;
  }

  return null;
}
