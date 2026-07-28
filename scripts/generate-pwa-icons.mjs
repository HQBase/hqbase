import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logo = await readFile(path.join(root, "public/logo.svg"), "utf8");
const browser = await chromium.launch({ headless: true });

try {
  for (const icon of [
    { file: "icon-512.png", logoWidth: 380, size: 512 },
    { file: "icon-192.png", logoWidth: 143, size: 192 },
    { file: "apple-touch-icon.png", logoWidth: 134, size: 180 },
    { file: "icon-maskable-512.png", logoWidth: 330, size: 512 }
  ]) {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { height: icon.size, width: icon.size }
    });

    await page.setContent(
      `<!doctype html>
      <style>
        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          overflow: hidden;
          background: #080808;
        }
        body {
          display: grid;
          place-items: center;
        }
        svg {
          display: block;
          width: ${icon.logoWidth}px;
          height: auto;
        }
      </style>
      ${logo}`,
      { waitUntil: "load" }
    );
    await page.screenshot({
      path: path.join(root, "public/icons", icon.file),
      type: "png"
    });
    await page.close();
  }
} finally {
  await browser.close();
}
