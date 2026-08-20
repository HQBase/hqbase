import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { prepareAuditInsert, recordAudit } from "@worker/features/audit/service";
import { describe, expect, it } from "vitest";

describe("prepared audit inserts", () => {
  it("inserts an unconditional audit event", async () => {
    const fixture = auditDatabase();
    try {
      await prepareAuditInsert(fixture.db, auditInput()).run();
      expect(auditCount(fixture.sqlite)).toBe(1);
    } finally {
      fixture.sqlite.close();
    }
  });

  it("inserts only when the personal access token exists", async () => {
    const fixture = auditDatabase();
    try {
      insertToken(fixture.sqlite, "pat_exists", "usr_owner", "2026-08-20T00:00:00.000Z");
      await prepareAuditInsert(fixture.db, auditInput(), {
        kind: "personal-access-token-exists",
        id: "pat_exists"
      }).run();
      await prepareAuditInsert(fixture.db, auditInput(), {
        kind: "personal-access-token-exists",
        id: "pat_missing"
      }).run();
      expect(auditCount(fixture.sqlite)).toBe(1);
    } finally {
      fixture.sqlite.close();
    }
  });

  it("inserts for an active token without an owner filter", async () => {
    const fixture = auditDatabase();
    try {
      insertToken(fixture.sqlite, "pat_active_owner", "usr_owner", null);
      await prepareAuditInsert(fixture.db, auditInput(), {
        kind: "active-personal-access-token",
        id: "pat_active_owner"
      }).run();
      expect(auditCount(fixture.sqlite)).toBe(1);
    } finally {
      fixture.sqlite.close();
    }
  });

  it.each([
    { label: "matching user", userId: "usr_owner", expectedCount: 1 },
    { label: "nonmatching user", userId: "usr_other", expectedCount: 0 }
  ])("applies the active-token user filter: $label", async ({ expectedCount, userId }) => {
    const fixture = auditDatabase();
    try {
      insertToken(fixture.sqlite, "pat_active_user", "usr_owner", null);
      await prepareAuditInsert(fixture.db, auditInput(), {
        kind: "active-personal-access-token",
        id: "pat_active_user",
        userId
      }).run();
      expect(auditCount(fixture.sqlite)).toBe(expectedCount);
    } finally {
      fixture.sqlite.close();
    }
  });

  it("does not insert for a revoked token", async () => {
    const fixture = auditDatabase();
    try {
      insertToken(fixture.sqlite, "pat_revoked", "usr_owner", "2026-08-20T00:00:00.000Z");
      await prepareAuditInsert(fixture.db, auditInput(), {
        kind: "active-personal-access-token",
        id: "pat_revoked"
      }).run();
      expect(auditCount(fixture.sqlite)).toBe(0);
    } finally {
      fixture.sqlite.close();
    }
  });
});

describe("audit redaction guard", () => {
  it.each([
    "subject",
    "body",
    "email",
    "password",
    "token",
    "filename",
    "tokenHash",
    "token_hash",
    "TOKEN-HASH",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh-token",
    "authorization",
    "Authorization-Header",
    "requestBody",
    "request_body",
    "responseBody",
    "response-body"
  ])("rejects %s metadata before touching storage", async (key) => {
    await expect(
      recordAudit(null as unknown as D1Database, {
        ...auditInput(),
        metadata: { [key]: "sensitive" }
      })
    ).rejects.toThrow("Sensitive audit metadata");
  });

  it("allows the safe personal access token record ID", async () => {
    const fixture = auditDatabase();
    try {
      await recordAudit(fixture.db, {
        ...auditInput(),
        metadata: { personalAccessTokenId: "pat_safe_id" }
      });
      const metadata = fixture.sqlite.prepare("SELECT metadata_json FROM audit_events").get() as {
        metadata_json: string;
      };
      expect(JSON.parse(metadata.metadata_json)).toEqual({
        personalAccessTokenId: "pat_safe_id"
      });
    } finally {
      fixture.sqlite.close();
    }
  });
});

function auditInput() {
  return {
    correlationId: "request_123",
    actorType: "system" as const,
    action: "test",
    resourceType: "test",
    outcome: "success" as const
  };
}

function auditDatabase(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      occurred_at TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      outcome TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );
    CREATE TABLE personal_access_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      revoked_at TEXT
    );
  `);
  return {
    db: {
      prepare(query: string) {
        return d1Statement(sqlite, query);
      }
    } as D1Database,
    sqlite
  };
}

function d1Statement(
  sqlite: DatabaseSync,
  query: string,
  values: SQLInputValue[] = []
): D1PreparedStatement {
  return {
    bind(...boundValues: unknown[]) {
      return d1Statement(sqlite, query, boundValues as SQLInputValue[]);
    },
    async run() {
      const result = sqlite.prepare(query).run(...values);
      return {
        success: true,
        meta: { changes: Number(result.changes) },
        results: []
      } as unknown as D1Result;
    }
  } as D1PreparedStatement;
}

function insertToken(
  sqlite: DatabaseSync,
  id: string,
  userId: string,
  revokedAt: string | null
): void {
  sqlite
    .prepare("INSERT INTO personal_access_tokens (id, user_id, revoked_at) VALUES (?, ?, ?)")
    .run(id, userId, revokedAt);
}

function auditCount(sqlite: DatabaseSync): number {
  const row = sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get() as {
    count: number;
  };
  return row.count;
}
