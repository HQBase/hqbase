export function buildEmailHtmlDocument(input: {
  allowRemoteImages: boolean;
  html: string;
  origin: string;
}): string {
  const origin = new URL(input.origin).origin;
  const imageSources = input.allowRemoteImages ? `${origin} https: http:` : origin;
  const policy = `default-src 'none'; img-src ${imageSources}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}"><meta name="referrer" content="no-referrer"><style>${baseStyles}</style></head><body>${input.html}</body></html>`;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

const baseStyles = `
  :root { color-scheme: light only; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; background: #fff; color: #171717; }
  body { padding: 20px; font-family: Aptos, ui-sans-serif, system-ui, sans-serif; font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #1d4ed8; }
  blockquote { margin-left: 0; padding-left: 16px; border-left: 3px solid #d4d4d4; }
`;
