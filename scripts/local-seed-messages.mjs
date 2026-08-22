import { buildCuratedMessageLinesA } from "./local-seed-messages-a.mjs";
import { buildCuratedMessageLinesB } from "./local-seed-messages-b.mjs";

export function buildCuratedMessageLines(timeline) {
  return [...buildCuratedMessageLinesA(timeline), ...buildCuratedMessageLinesB(timeline)];
}
