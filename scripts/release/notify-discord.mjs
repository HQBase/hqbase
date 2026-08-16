#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DISCORD_EMBED_DESCRIPTION_LIMIT = 4096;

const DISCORD_COLOR = 0xff8a3d;
const MAX_ATTEMPTS = 3;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function splitDiscordMarkdown(markdown, limit = DISCORD_EMBED_DESCRIPTION_LIMIT) {
  const notes = markdown.trim();
  if (!notes) throw new Error("Release notes are empty.");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Discord message limit is invalid.");

  const chunks = [];
  let remaining = notes;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const minimumBreak = Math.floor(limit / 2);
    const boundaries = [
      boundaryAfter(window, "\n\n"),
      boundaryAfter(window, "\n"),
      boundaryAfter(window, " ")
    ];
    const end = boundaries.find((boundary) => boundary >= minimumBreak) ?? limit;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function buildDiscordReleaseMessages({ notes, repository, version, publishedAt }) {
  if (!VERSION_PATTERN.test(version)) throw new Error("Release version must be semantic.");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GitHub repository must use owner/name format.");
  }

  const chunks = splitDiscordMarkdown(notes);
  const releaseUrl = `https://github.com/${repository}/releases/tag/v${version}`;
  const timestamp = publishedAt ?? new Date().toISOString();

  return chunks.map((description, index) => {
    const part = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
    return {
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title:
            index === 0
              ? `HQBase ${version} is available${part}`
              : `HQBase ${version} changes${part}`,
          url: releaseUrl,
          description,
          color: DISCORD_COLOR,
          footer: { text: "Signed stable release" },
          timestamp
        }
      ]
    };
  });
}

export async function sendDiscordRelease({
  fetchImpl = globalThis.fetch,
  notes,
  repository,
  sleep = defaultSleep,
  version,
  webhookUrl
}) {
  const url = discordWebhookUrl(webhookUrl);
  const messages = buildDiscordReleaseMessages({ notes, repository, version });

  for (const message of messages) {
    await postDiscordMessage({ fetchImpl, message, sleep, url });
  }

  return messages.length;
}

async function postDiscordMessage({ fetchImpl, message, sleep, url }) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
        redirect: "error"
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Discord notification failed.");
      if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) return;
    lastError = new Error(
      `Discord rejected the release notification with HTTP ${response.status}.`
    );
    if (response.status !== 429 && response.status < 500) throw lastError;
    if (attempt < MAX_ATTEMPTS) {
      await sleep(await retryDelay(response, attempt));
    }
  }
  throw lastError ?? new Error("Discord notification failed.");
}

function boundaryAfter(value, separator) {
  const index = value.lastIndexOf(separator);
  return index < 0 ? -1 : index + separator.length;
}

function discordWebhookUrl(value) {
  if (!value) throw new Error("DISCORD_WEBHOOK_URL is required.");
  const url = new URL(value);
  const officialHost =
    url.hostname === "discord.com" ||
    url.hostname.endsWith(".discord.com") ||
    url.hostname === "discordapp.com" ||
    url.hostname.endsWith(".discordapp.com");
  if (
    url.protocol !== "https:" ||
    !officialHost ||
    !/^\/api(?:\/v\d+)?\/webhooks\//.test(url.pathname)
  ) {
    throw new Error("DISCORD_WEBHOOK_URL must be an official Discord webhook URL.");
  }
  url.searchParams.set("wait", "true");
  return url;
}

async function retryDelay(response, attempt) {
  try {
    const body = await response.json();
    if (typeof body.retry_after === "number" && body.retry_after >= 0) {
      return Math.ceil(body.retry_after * 1000);
    }
  } catch {
    // Discord error responses do not always contain JSON.
  }
  return 500 * 2 ** (attempt - 1);
}

function defaultSleep(milliseconds) {
  return new Promise((complete) => setTimeout(complete, milliseconds));
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const notesFile = argv[0];
  if (!notesFile) throw new Error("A release-notes file is required.");
  const notes = await readFile(resolve(notesFile), "utf8");
  const messageCount = await sendDiscordRelease({
    notes,
    repository: environment.GITHUB_REPOSITORY ?? "",
    version: environment.HQBASE_RELEASE_VERSION ?? "",
    webhookUrl: environment.DISCORD_WEBHOOK_URL
  });
  console.log(`Posted the HQBase release notes to Discord in ${messageCount} message(s).`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Discord notification failed.");
    process.exitCode = 1;
  });
}
