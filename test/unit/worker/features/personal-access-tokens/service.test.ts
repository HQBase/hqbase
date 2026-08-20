import { describe, expect, it } from "vitest";
import {
  createPersonalAccessToken,
  revokePersonalAccessToken
} from "../../../../../worker/features/personal-access-tokens/service";
import { AppError } from "../../../../../worker/lib/errors";
import { assertSecretSafeAbsent } from "../../../../helpers/secret-safe-assertions";

describe("personal access token creation", () => {
  it("returns plaintext only after the PAT and audit both commit", async () => {
    const fake = new FakeD1([batchResult(1), batchResult(1)], validMetadataRow());

    const result = await createPersonalAccessToken(fake.db, {
      userId: "usr_creator",
      correlationId: "request_create",
      name: "Nightly archive",
      expiresAt: "2026-11-17T18:00:00.000Z",
      now: Date.parse("2026-08-20T18:00:00.000Z")
    });

    expect(/^hqb_pat_[A-Za-z0-9_-]{43}$/u.test(result.token)).toBe(true);
    expect(/^pat_[A-Za-z0-9_-]+$/u.test(result.personalAccessToken.id)).toBe(true);
    const { id: _expectedId, ...expectedMetadata } = validMetadataRow();
    const { id: _actualId, ...actualMetadata } = result.personalAccessToken;
    expect(actualMetadata).toEqual(expectedMetadata);

    const insert = requiredCall(fake, "INSERT INTO personal_access_tokens");
    const tokenHash = String(insert.values[3]);
    const audit = requiredCall(fake, "INSERT INTO audit_events");
    expect(audit.values[2]).toBe("request_create");
    expect(audit.values[3]).toBe("user");
    expect(audit.values[4]).toBe("usr_creator");
    expect(audit.values[5]).toBe("personal_access_token.create");
    expect(audit.values[6]).toBe("personal_access_token");
    expect(audit.values[7]).toBe(result.personalAccessToken.id);
    expect(audit.values[8]).toBe("success");
    assertSecretSafeAbsent({ query: audit.query, values: audit.values }, [result.token, tokenHash]);
  });

  it("maps the supported zero-change result to the active-token limit", async () => {
    const fake = new FakeD1([batchResult(0), batchResult(0)], validMetadataRow());
    const error = await captureAppError(
      createPersonalAccessToken(fake.db, createInput("request_limit"))
    );
    expect(error.code).toBe("PERSONAL_ACCESS_TOKEN_LIMIT_REACHED");
    expect(error.status).toBe(409);
  });

  it("fails closed on mismatched create batch metadata", async () => {
    const fake = new FakeD1([batchResult(1), batchResult(0)], validMetadataRow());
    const error = await captureAppError(
      createPersonalAccessToken(fake.db, createInput("request_mismatch"))
    );
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.status).toBe(500);
  });

  it("fails closed when committed metadata is missing", async () => {
    const fake = new FakeD1([batchResult(1), batchResult(1)], null);
    const error = await captureAppError(
      createPersonalAccessToken(fake.db, createInput("request_missing_metadata"))
    );
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.status).toBe(500);
  });

  it("propagates a rejected create batch", async () => {
    const fake = new FakeD1([], validMetadataRow(), new Error("batch failed"));
    await expect(
      createPersonalAccessToken(fake.db, createInput("request_rejected"))
    ).rejects.toThrow("batch failed");
  });
});

describe("personal access token revocation", () => {
  it.each([
    {
      label: "first revoke",
      results: [batchResult(1), batchResult(1), batchResult(0, [{ id: "pat_target" }])],
      expected: "revoked"
    },
    {
      label: "repeat revoke",
      results: [batchResult(0), batchResult(0), batchResult(0, [{ id: "pat_target" }])],
      expected: "already-revoked"
    },
    {
      label: "missing target",
      results: [batchResult(0), batchResult(0), batchResult(0, [])],
      expected: "not-found"
    }
  ] as const)("maps the supported result for $label", async ({ expected, results }) => {
    const fake = new FakeD1([...results], null);
    await expect(
      revokePersonalAccessToken(fake.db, {
        id: "pat_target",
        actorId: "usr_revoker",
        actorRole: "member",
        correlationId: "request_revoke",
        now: Date.parse("2026-08-20T18:00:00.000Z")
      })
    ).resolves.toBe(expected);

    const audit = requiredCall(fake, "INSERT INTO audit_events");
    expect(audit.values[2]).toBe("request_revoke");
    expect(audit.values[3]).toBe("user");
    expect(audit.values[4]).toBe("usr_revoker");
    expect(audit.values[5]).toBe("personal_access_token.revoke");
    expect(audit.values[6]).toBe("personal_access_token");
    expect(audit.values[7]).toBe("pat_target");
    expect(audit.values[8]).toBe("success");
  });

  it("fails closed on mismatched revoke batch metadata", async () => {
    const fake = new FakeD1(
      [batchResult(1), batchResult(0), batchResult(0, [{ id: "pat_target" }])],
      null
    );
    const error = await captureAppError(
      revokePersonalAccessToken(fake.db, {
        id: "pat_target",
        actorId: "usr_owner",
        actorRole: "owner",
        correlationId: "request_revoke_mismatch"
      })
    );
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.status).toBe(500);
  });

  it("propagates a rejected revoke batch", async () => {
    const fake = new FakeD1([], null, new Error("batch failed"));
    await expect(
      revokePersonalAccessToken(fake.db, {
        id: "pat_target",
        actorId: "usr_owner",
        actorRole: "owner",
        correlationId: "request_revoke_rejected"
      })
    ).rejects.toThrow("batch failed");
  });
});

type PreparedCall = { query: string; values: unknown[] };

class FakeD1 {
  readonly calls: PreparedCall[] = [];
  readonly db: D1Database;

  constructor(
    private readonly results: D1Result[],
    private readonly metadataRow: Record<string, unknown> | null,
    private readonly batchError?: Error
  ) {
    this.db = {
      prepare: (query: string) => this.statement(query),
      batch: async () => {
        if (this.batchError) throw this.batchError;
        return this.results;
      }
    } as unknown as D1Database;
  }

  private statement(query: string): D1PreparedStatement {
    const call: PreparedCall = { query, values: [] };
    this.calls.push(call);
    const statement = {
      bind: (...values: unknown[]) => {
        call.values = values;
        return statement;
      },
      first: async () =>
        this.metadataRow && query.includes("FROM personal_access_tokens pat")
          ? { ...this.metadataRow, id: call.values[0] }
          : this.metadataRow
    };
    return statement as unknown as D1PreparedStatement;
  }
}

function batchResult(changes: number, results: unknown[] = []): D1Result {
  return {
    success: true,
    meta: { changes },
    results
  } as unknown as D1Result;
}

function validMetadataRow() {
  return {
    id: "pat_created",
    userId: "usr_creator",
    ownerName: "Workspace Owner",
    name: "Nightly archive",
    tokenSuffix: "a1B2",
    createdAt: "2026-08-20T18:00:00.000Z",
    expiresAt: "2026-11-17T18:00:00.000Z"
  };
}

function createInput(correlationId: string) {
  return {
    userId: "usr_creator",
    correlationId,
    name: "Nightly archive",
    expiresAt: null,
    now: Date.parse("2026-08-20T18:00:00.000Z")
  };
}

function requiredCall(fake: FakeD1, fragment: string): PreparedCall {
  const call = fake.calls.find(({ query }) => query.includes(fragment));
  if (!call) throw new Error("Expected prepared statement was not created.");
  return call;
}

async function captureAppError(operation: Promise<unknown>): Promise<AppError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof AppError) return error;
  }
  throw new Error("Expected an AppError.");
}
