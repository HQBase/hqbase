/** Escapes user text for a literal substring match with `LIKE ... ESCAPE '\\'`. */
export function literalSearchPattern(value: string): string {
  return `%${value.replace(/[\\%_]/gu, "\\$&")}%`;
}
