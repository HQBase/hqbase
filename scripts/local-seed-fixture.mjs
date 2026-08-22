import { buildBulkSeedLines } from "./local-seed-bulk.mjs";
import { buildDraftSeedLines } from "./local-seed-drafts.mjs";
import { buildCuratedMessageLines } from "./local-seed-messages.mjs";
import { buildThreadSeedLines } from "./local-seed-threads.mjs";
import { buildSeedTimeline } from "./local-seed-timeline.mjs";
import { buildWorkspaceSeedLines } from "./local-seed-workspace.mjs";

export function buildSeedSql(passwordHash, seedDate = new Date()) {
  const timeline = buildSeedTimeline(seedDate);
  const lines = ["PRAGMA foreign_keys = ON;"];
  lines.push(...buildWorkspaceSeedLines(passwordHash, timeline));
  lines.push(...buildThreadSeedLines(timeline));
  lines.push(...buildCuratedMessageLines(timeline));
  lines.push(...buildDraftSeedLines(timeline));
  lines.push(...buildBulkSeedLines(seedDate, timeline));
  return `${lines.join("\n")}\n`;
}
