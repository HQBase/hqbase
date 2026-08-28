import type { AppTheme } from "@/features/theme/theme";

export function buildEmailHtmlDocument(input: {
  allowDataImages?: boolean;
  allowRemoteImages: boolean;
  html: string;
  origin: string;
  theme: AppTheme;
}): string {
  const origin = new URL(input.origin).origin;
  const imageSources = `${input.allowRemoteImages ? `${origin} https: http:` : origin}${
    input.allowDataImages ? " data:" : ""
  }`;
  const policy = `default-src 'none'; img-src ${imageSources}; font-src ${origin}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html data-theme="${input.theme}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="${input.theme}"><style>${baseStyles(input.theme)}</style></head><body>${input.html}</body></html>`;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function baseStyles(theme: AppTheme): string {
  const palette =
    theme === "dark"
      ? {
          foreground: "#f2f2f2",
          link: "#93c5fd",
          quoteBorder: "#404040"
        }
      : {
          foreground: "#171717",
          link: "#1d4ed8",
          quoteBorder: "#d4d4d4"
        };

  return `
  :root { color-scheme: ${theme}; }
  * { box-sizing: border-box; }
  html { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; background: transparent; }
  body { margin: 0; padding: 0; background: transparent; color: ${palette.foreground}; font: small/1.5 Arial, Helvetica, sans-serif; }
  a { color: ${palette.link}; }
  blockquote.gmail_quote { margin: 0 0 0 0.8ex; border-left: 1px solid ${palette.quoteBorder}; padding-left: 1ex; }
  blockquote { margin: 0 0 0 0.8ex; border-left: 1px solid ${palette.quoteBorder}; padding-left: 1ex; }
`;
}
