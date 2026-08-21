import { type ChildNode, type Element, isTag, isText } from "domhandler";
import { parseDocument } from "htmlparser2";
import sanitizeHtml from "sanitize-html";

export type QuotedHtmlParts = {
  afterQuote: string | null;
  body: string;
  quote: string | null;
};

type QuoteRange = {
  end: number;
  start: number;
};

const quoteClassNames = new Set([
  "protonmail_quote",
  "tutanota_quote",
  "zmail_extra",
  "skiff_quote"
]);

const microsoftWordSeparatorPatterns = [
  "border-top:solid #E1E1E1 1",
  "border-top:solid #B5C4DF 1",
  "border-block-start:solid #E1E1E1 1",
  "border-block-start:solid #B5C4DF 1"
];

const wordSeparatorPaddingPatterns = ["padding:3", "padding-block:3"];

const windowsMailSeparatorAxes = [
  ["border-top-color: rgb(229, 229, 229)", "border-block-start-color: rgb(229, 229, 229)"],
  ["border-top-width: 1px", "border-block-start-width: 1px"],
  ["border-top-style: solid", "border-block-start-style: solid"]
];

const fromHeaderPatterns = [
  "From:",
  "De :",
  "De:",
  "Von:",
  "Da:",
  "Van:",
  "Od:",
  "От:",
  "Από:",
  "Från:",
  "Fra:",
  "Lähettäjä:",
  "Feladó:",
  "Kimden:",
  "מאת:",
  "من:",
  "Từ:",
  "จาก:",
  "差出人:",
  "送信者:",
  "发件人:",
  "寄件者:",
  "보낸 사람:",
  "보낸사람:"
];

const originalMessageMarker = "------- Original Message -------";

/**
 * Split message HTML with the structural marker model used by Proton Mail's
 * messageBlockquote helper. The source remains unchanged; each returned fragment is sanitized later.
 */
export function splitQuotedHtml(html: string): QuotedHtmlParts {
  if (!html.trim()) return unsplit(html);

  const document = parseDocument(html, {
    decodeEntities: false,
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
    withEndIndices: true,
    withStartIndices: true
  });
  const elements = collectElements(document.children);
  const ranges = elements
    .filter(isSelectableQuoteElement)
    .map(quoteElementRange)
    .filter((range): range is QuoteRange => range !== null);
  const outlookRange = findOutlookQuoteRange(elements, html);
  if (outlookRange) ranges.push(outlookRange);

  const range =
    selectLastQuoteRange(ranges) ??
    selectLastQuoteRange(
      elements
        .filter(hasOriginalMessageTextNode)
        .map(quoteTailRange)
        .filter((candidate): candidate is QuoteRange => candidate !== null)
    ) ??
    null;
  if (!range) return unsplit(html);

  const body = html.slice(0, range.start).trimEnd();
  const quote = html.slice(range.start, range.end).trim();
  const afterQuote = html.slice(range.end).trimStart();
  if (!quote) return unsplit(html);

  return {
    afterQuote: afterQuote || null,
    body,
    quote
  };
}

function unsplit(html: string): QuotedHtmlParts {
  return { afterQuote: null, body: html, quote: null };
}

function collectElements(nodes: ChildNode[], result: Element[] = []): Element[] {
  for (const node of nodes) {
    if (!isTag(node)) continue;
    result.push(node);
    collectElements(node.children, result);
  }
  return result;
}

function isNonEmptyElement(element: Element): boolean {
  return element.children.some((child) => isTag(child) || isText(child));
}

function isSelectableQuoteElement(element: Element): boolean {
  return (
    isRecognizedQuoteElement(element) && (isNonEmptyElement(element) || isQuoteTailMarker(element))
  );
}

function quoteElementRange(element: Element): QuoteRange | null {
  return isQuoteTailMarker(element) ? quoteTailRange(element) : elementRange(element);
}

function quoteTailRange(element: Element): QuoteRange | null {
  const adjusted = firstElementChildOfParent(element) ? element.parent : element;
  return adjusted && isTag(adjusted)
    ? rangeThroughFollowingSiblings(adjusted)
    : rangeThroughFollowingSiblings(element);
}

function isQuoteTailMarker(element: Element): boolean {
  const classes = classNames(element);
  const id = element.attribs.id;
  return (
    classes.includes("moz-cite-prefix") ||
    id === "divRplyFwdMsg" ||
    id === '3D\\"divRplyFwdMsg\\"' ||
    (element.name === "hr" && id === "replySplit")
  );
}

function hasOriginalMessageTextNode(element: Element): boolean {
  return element.children.some((child) => isText(child) && child.data === originalMessageMarker);
}

function isRecognizedQuoteElement(element: Element): boolean {
  const classes = classNames(element);
  if (classes.some((className) => quoteClassNames.has(className))) return true;
  if (classes.includes("gmail_quote") && !classes.includes("gmail_quote_container")) return true;
  if (element.name === "div" && classes.includes("gmail_extra")) return true;
  if (element.name === "div" && classes.includes("yahoo_quoted")) return true;
  if (element.name === "blockquote" && classes.includes("iosymail")) return true;
  if (element.name === "blockquote" && "data-skiff-mail" in element.attribs) return true;
  if (classes.includes("moz-cite-prefix")) return true;

  const id = element.attribs.id;
  if (id === "divRplyFwdMsg") return true;
  if (element.name === "div" && id === "mail-editor-reference-message-container") return true;
  if (element.name === "div" && id === '3D\\"divRplyFwdMsg\\"') return true;
  if (element.name === "hr" && id === "replySplit") return true;
  if (element.name === "div" && id === "isForwardContent") return true;
  if (element.name === "blockquote" && id === "isReplyContent") return true;
  if (element.name === "div" && ["mailcontent", "origbody", "reply139content"].includes(id ?? "")) {
    return true;
  }
  if (element.name === "blockquote" && id === "oriMsgHtmlSeperator") return true;
  if (element.name === "blockquote" && element.attribs.type === "cite") return true;
  return element.attribs.name === "quote";
}

function findOutlookQuoteRange(elements: Element[], html: string): QuoteRange | null {
  for (const element of elements) {
    if (element.name !== "div" || !hasOutlookSeparatorStyle(element)) continue;
    if (hasQuoteAncestor(element)) continue;
    if (!startsWithFromHeader(followingText(element, html))) continue;

    const adjusted = firstElementChildOfParent(element) ? element.parent : element;
    if (!adjusted || !isTag(adjusted)) return rangeThroughFollowingSiblings(element);
    return rangeThroughFollowingSiblings(adjusted);
  }
  return null;
}

function hasOutlookSeparatorStyle(element: Element): boolean {
  const style = element.attribs.style ?? "";
  const microsoftWord =
    style.includes("border:none") &&
    wordSeparatorPaddingPatterns.some((pattern) => style.includes(pattern)) &&
    microsoftWordSeparatorPatterns.some((pattern) => style.includes(pattern));
  const windowsMail = windowsMailSeparatorAxes.every((alternatives) =>
    alternatives.some((pattern) => style.includes(pattern))
  );
  return microsoftWord || windowsMail;
}

function hasQuoteAncestor(element: Element): boolean {
  let parent = element.parent;
  while (parent) {
    if (isTag(parent) && isRecognizedQuoteElement(parent)) return true;
    parent = parent.parent;
  }
  return false;
}

function startsWithFromHeader(value: string): boolean {
  const normalized = value.replace(/\u00a0/gu, " ").trim();
  return fromHeaderPatterns.some((pattern) => normalized.startsWith(pattern));
}

function followingText(element: Element, html: string): string {
  const ownText = visibleTextForNode(element, html);
  if (ownText) return ownText;

  let sibling: ChildNode | null = element.next;
  while (sibling) {
    const text = visibleTextForNode(sibling, html);
    if (text) return text;
    sibling = sibling.next;
  }
  return "";
}

function firstElementChildOfParent(element: Element): boolean {
  const parent = element.parent;
  if (!parent || !isTag(parent)) return false;
  return parent.children.find(isTag) === element;
}

function rangeThroughFollowingSiblings(element: Element): QuoteRange | null {
  const range = elementRange(element);
  if (!range) return null;

  let sibling: ChildNode | null = element.next;
  while (sibling) {
    if (sibling.endIndex !== null) range.end = Math.max(range.end, sibling.endIndex + 1);
    sibling = sibling.next;
  }
  return range;
}

function selectLastQuoteRange(ranges: QuoteRange[]): QuoteRange | null {
  const sorted = ranges.sort((left, right) => left.start - right.start || right.end - left.end);
  return sorted.find((candidate) => !sorted.some((other) => other.start >= candidate.end)) ?? null;
}

function elementRange(element: Element): QuoteRange | null {
  if (element.startIndex === null || element.endIndex === null) return null;
  return { start: element.startIndex, end: element.endIndex + 1 };
}

function visibleTextForNode(node: ChildNode, html: string): string {
  if (node.startIndex === null || node.endIndex === null) return "";
  return visibleText(html.slice(node.startIndex, node.endIndex + 1));
}

function classNames(element: Element): string[] {
  return (element.attribs.class ?? "").split(/\s+/u).filter(Boolean);
}

function visibleText(html: string): string {
  return sanitizeHtml(html, {
    allowedAttributes: {},
    allowedTags: [],
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "noscript"]
  })
    .replace(/\u00a0/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
