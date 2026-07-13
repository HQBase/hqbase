export function normalizeSubject(subject: string): string {
  return subject
    .trim()
    .replace(/^(re|fw|fwd):\s*/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function ensureReplySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

export function createMessageId(primaryDomain: string): string {
  return `<${crypto.randomUUID()}@${primaryDomain}>`;
}

export function parseReferences(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
