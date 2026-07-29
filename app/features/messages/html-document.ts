import type { AppTheme } from "@/features/theme/theme";

export function buildEmailHtmlDocument(input: {
  allowRemoteImages: boolean;
  html: string;
  origin: string;
  theme: AppTheme;
}): string {
  const origin = new URL(input.origin).origin;
  const imageSources = input.allowRemoteImages ? `${origin} https: http:` : origin;
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
  @font-face { font-family: "Geist Sans"; src: url("/fonts/Geist-Regular.woff2") format("woff2"); font-style: normal; font-weight: 400; font-display: swap; }
  :root { color-scheme: ${theme}; }
  * { box-sizing: border-box; }
  html { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; background: transparent; }
  body { margin: 0; padding: 0; background: transparent; color: ${palette.foreground}; font-family: "Geist Sans", ui-sans-serif, system-ui, sans-serif; font-size: 14px; line-height: 1.55; }
  a { color: ${palette.link}; }
  blockquote { margin-left: 0; padding-left: 16px; border-left: 3px solid ${palette.quoteBorder}; }
`;
}
