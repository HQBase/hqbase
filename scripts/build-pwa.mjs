import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const allowedPrecachePaths = [
  /^\/assets\//,
  /^\/fonts\//,
  /^\/icons\//,
  /^\/logo\.svg$/,
  /^\/manifest\.webmanifest$/,
  /^\/offline\.html$/
];

export function isAllowedPrecacheUrl(url) {
  return allowedPrecachePaths.some((pattern) => pattern.test(url));
}

export function validateManifest(manifest) {
  if (
    manifest.id !== "/" ||
    manifest.start_url !== "/" ||
    manifest.scope !== "/" ||
    manifest.display !== "standalone" ||
    typeof manifest.name !== "string" ||
    manifest.name.length === 0
  ) {
    throw new Error("The PWA manifest is missing its installable HQBase identity.");
  }

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const [size, purpose] of [
    ["192x192", "any"],
    ["512x512", "any"],
    ["512x512", "maskable"]
  ]) {
    if (!icons.some((icon) => icon.sizes === size && icon.purpose?.includes(purpose))) {
      throw new Error(`The PWA manifest is missing its ${size} ${purpose} icon.`);
    }
  }
}

export function renderServiceWorker({ cacheName, precacheUrls }) {
  return `const CACHE_PREFIX = "hqbase-pwa-";
const CACHE_NAME = ${JSON.stringify(cacheName)};
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
              .map((key) => caches.delete(key))
          )
        ),
      self.registration.navigationPreload?.enable(),
      self.clients.claim()
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(request));
        } catch {
          return (await caches.match("/offline.html")) || Response.error();
        }
      })()
    );
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
`;
}

export async function buildPwa(root = process.cwd()) {
  const dist = path.join(root, "dist");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(dist, "manifest.webmanifest"), "utf8"));
  validateManifest(manifest);

  const files = await listFiles(dist);
  const precacheUrls = files
    .map((file) => `/${path.relative(dist, file).split(path.sep).join("/")}`)
    .filter(isAllowedPrecacheUrl)
    .sort();

  for (const icon of manifest.icons) {
    const file = path.join(dist, icon.src.replace(/^\//, ""));
    await validatePngDimensions(file, icon.sizes);
  }

  if (!precacheUrls.includes("/offline.html")) {
    throw new Error("The PWA offline document is missing from the build.");
  }

  const cacheName = `hqbase-pwa-${packageJson.name}-${packageJson.version}`;
  await writeFile(
    path.join(dist, "service-worker.js"),
    renderServiceWorker({ cacheName, precacheUrls })
  );
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(location)));
    else files.push(location);
  }
  return files;
}

async function validatePngDimensions(file, expectedSize) {
  if (!(await stat(file)).isFile()) throw new Error(`Missing PWA icon: ${file}`);
  const bytes = await readFile(file);
  const [width, height] = expectedSize.split("x").map(Number);
  if (
    bytes.toString("ascii", 1, 4) !== "PNG" ||
    bytes.readUInt32BE(16) !== width ||
    bytes.readUInt32BE(20) !== height
  ) {
    throw new Error(`PWA icon ${file} does not match ${expectedSize}.`);
  }
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) await buildPwa(`${path.dirname(fileURLToPath(import.meta.url))}/..`);
