export type PersonalAccessTokenCleanupResponse = {
  status(): number;
  json(): Promise<unknown>;
};

export type PersonalAccessTokenCleanupInput = {
  creationAttempted: boolean;
  recordId: string | null;
  uniqueName: string;
  list: () => Promise<PersonalAccessTokenCleanupResponse>;
  revoke: (id: string) => Promise<PersonalAccessTokenCleanupResponse>;
};

export async function cleanupPersonalAccessToken(
  input: PersonalAccessTokenCleanupInput
): Promise<void> {
  if (!input.creationAttempted) return;
  const list = await input.list().catch(() => {
    throw new Error("PAT cleanup list request failed.");
  });
  if (list.status() !== 200) {
    throw new Error(`PAT cleanup list failed with status ${list.status()}.`);
  }
  const value = await list.json().catch(() => {
    throw new Error("PAT cleanup list returned invalid JSON.");
  });
  const tokens = readCleanupTokens(value);
  const target =
    (input.recordId ? tokens.find((token) => token.id === input.recordId) : undefined) ??
    tokens.find((token) => token.name === input.uniqueName);
  if (!target) return;
  const revoked = await input.revoke(target.id).catch(() => {
    throw new Error("PAT cleanup revoke request failed.");
  });
  if (revoked.status() !== 204) {
    throw new Error(`PAT cleanup revoke failed with status ${revoked.status()}.`);
  }
}

export function throwWithCleanupContext(primary: unknown, cleanup: unknown): never {
  const cleanupErrors = flattenCleanupErrors(cleanup);
  if (!(primary instanceof Error)) {
    throw new AggregateError(
      [primary, ...cleanupErrors],
      "PAT staging test and cleanup both failed."
    );
  }
  const summaries = cleanupErrors.map((error) => `Cleanup also failed: ${error.message}`);
  const stacks = cleanupErrors.map((error) => `Cleanup failure:\n${error.stack ?? error.message}`);
  primary.message = `${primary.message}\n${summaries.join("\n")}`;
  primary.stack = `${primary.stack ?? primary.message}\n${stacks.join("\n")}`;
  throw primary;
}

type CleanupToken = { id: string; name: string };

function readCleanupTokens(value: unknown): CleanupToken[] {
  if (!isRecord(value) || !Array.isArray(value.personalAccessTokens)) {
    throw new Error("PAT cleanup list returned malformed metadata.");
  }
  return value.personalAccessTokens.map((token) => {
    if (!isRecord(token) || typeof token.id !== "string" || typeof token.name !== "string") {
      throw new Error("PAT cleanup list returned malformed metadata.");
    }
    return { id: token.id, name: token.name };
  });
}

function flattenCleanupErrors(value: unknown): Error[] {
  if (value instanceof AggregateError) {
    return value.errors.flatMap((error) => flattenCleanupErrors(error));
  }
  return [value instanceof Error ? value : new Error("PAT cleanup failed.")];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
