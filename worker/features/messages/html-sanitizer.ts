import sanitizeHtml from "sanitize-html";

import type { StoredAttachment } from "./types";

const allowedTags = [
  "a",
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "ins",
  "li",
  "main",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
];

const styleProperties = [
  "background-color",
  "border",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-collapse",
  "border-color",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-spacing",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-style",
  "border-top-width",
  "border-width",
  "box-sizing",
  "clear",
  "color",
  "display",
  "float",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "list-style-position",
  "list-style-type",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "opacity",
  "overflow-wrap",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-indent",
  "text-transform",
  "vertical-align",
  "white-space",
  "width",
  "word-break"
];

const safeStyleValue =
  /^(?!.*(?:url\s*\(|image-set\s*\(|@import|expression\s*\(|javascript\s*:|data\s*:|var\s*\())[^\\]*$/i;
const remoteCssResource = /(?:https?:)?\/\//i;

export type SanitizedMessageHtml = {
  hasRemoteImages: boolean;
  html: string;
};

export function sanitizeMessageHtml(input: {
  allowRemoteImages: boolean;
  attachments: StoredAttachment[];
  html: string;
  messageId: string;
  origin: string;
}): SanitizedMessageHtml {
  const origin = safeOrigin(input.origin);
  const contentIds = new Map(
    input.attachments.flatMap((attachment) =>
      attachment.contentId
        ? [[normalizeContentId(attachment.contentId), attachment.id] as const]
        : []
    )
  );
  let hasRemoteImages = false;

  const html = sanitizeHtml(input.html, {
    allowProtocolRelative: false,
    allowedAttributes: {
      "*": ["align", "dir", "lang", "style", "title", "valign"],
      a: ["href", "rel", "target", "title"],
      col: ["span", "width"],
      img: ["alt", "height", "loading", "referrerpolicy", "src", "title", "width"],
      li: ["value"],
      ol: ["start", "type"],
      table: ["align", "bgcolor", "border", "cellpadding", "cellspacing", "height", "width"],
      td: ["align", "bgcolor", "colspan", "height", "rowspan", "valign", "width"],
      th: ["align", "bgcolor", "colspan", "height", "rowspan", "scope", "valign", "width"]
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedStyles: {
      "*": Object.fromEntries(styleProperties.map((property) => [property, [safeStyleValue]]))
    },
    allowedTags,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: false,
    nestingLimit: 80,
    nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    onOpenTag(name, attributes) {
      if (hasRemoteReference(name, attributes, origin)) hasRemoteImages = true;
    },
    transformTags: {
      a: (tagName, attributes) => ({ tagName, attribs: safeLinkAttributes(attributes) }),
      img: (tagName, attributes) => {
        const source = attributes.src?.trim() ?? "";
        const resolvedRemoteUrl = remoteUrl(source, origin);
        const next: sanitizeHtml.Attributes = { ...attributes, loading: "lazy" };
        delete next.srcset;
        if (source.toLowerCase().startsWith("cid:")) {
          const attachmentId = contentIds.get(normalizeContentId(source.slice(4)));
          if (attachmentId) {
            next.src = `${origin}/api/messages/${encodeURIComponent(input.messageId)}/inline/${encodeURIComponent(attachmentId)}`;
          } else {
            delete next.src;
          }
        } else if (resolvedRemoteUrl) {
          hasRemoteImages = true;
          if (input.allowRemoteImages) {
            next.src = resolvedRemoteUrl;
            next.referrerpolicy = "no-referrer";
          } else {
            delete next.src;
            next.alt ||= "Remote image hidden";
          }
        } else {
          delete next.src;
        }
        return { tagName, attribs: next };
      }
    }
  });

  return { hasRemoteImages, html };
}

function hasRemoteReference(
  tagName: string,
  attributes: sanitizeHtml.Attributes,
  origin: string
): boolean {
  if (attributes.style && remoteCssResource.test(attributes.style)) return true;
  if (attributes.background && isRemoteUrl(attributes.background, origin)) return true;
  if (["audio", "img", "link", "source", "video"].includes(tagName)) {
    return [
      attributes.src,
      attributes.poster,
      attributes.href,
      ...(attributes.srcset?.split(",") ?? [])
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => isRemoteUrl(value.trim().split(/\s+/, 1)[0] ?? "", origin));
  }
  return false;
}

function safeLinkAttributes(attributes: sanitizeHtml.Attributes): sanitizeHtml.Attributes {
  const href = attributes.href?.trim();
  if (!href || (!href.startsWith("#") && !isSafeLink(href))) {
    return { title: attributes.title ?? "" };
  }
  if (href.startsWith("#")) return { href, title: attributes.title ?? "" };
  return {
    href,
    rel: "noopener noreferrer",
    target: "_blank",
    title: attributes.title ?? ""
  };
}

function isSafeLink(value: string): boolean {
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isRemoteUrl(value: string, origin: string): boolean {
  return remoteUrl(value, origin) !== null;
}

function remoteUrl(value: string, origin: string): string | null {
  if (!value || value.toLowerCase().startsWith("cid:")) return null;
  try {
    const url = new URL(value, origin);
    return ["http:", "https:"].includes(url.protocol) && url.origin !== origin ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeContentId(value: string): string {
  const decoded = safeDecode(value).trim().replace(/^<|>$/g, "");
  return decoded.toLowerCase();
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeOrigin(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid application origin.");
  return url.origin;
}
