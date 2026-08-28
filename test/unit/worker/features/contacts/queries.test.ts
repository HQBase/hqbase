import { listRecipientSuggestions } from "@worker/features/contacts/queries";
import { describe, expect, it, vi } from "vitest";

describe("contact query limits", () => {
  it("binds a large mailbox scope once and avoids LIKE patterns", async () => {
    let boundValues: unknown[] = [];
    let preparedQuery = "";
    let statement: D1PreparedStatement;
    const bind = vi.fn((...values: unknown[]) => {
      boundValues = values;
      return statement;
    });
    statement = {
      all: vi.fn(async () => ({ results: [] })),
      bind
    } as unknown as D1PreparedStatement;
    const prepare = vi.fn((query: string) => {
      preparedQuery = query;
      return statement;
    });
    const mailboxIds = Array.from({ length: 40 }, (_, index) => `mbx_${index}`);

    await listRecipientSuggestions({ prepare } as unknown as D1Database, {
      limit: 100,
      scope: { includeUnassigned: false, mailboxIds },
      search: "a very long literal search that is safely longer than fifty bytes",
      userId: "usr_contacts"
    });

    expect(prepare).toHaveBeenCalledOnce();
    expect(preparedQuery).toContain("json_each(?)");
    expect(preparedQuery).toContain("instr(");
    expect(preparedQuery).not.toMatch(/\sLIKE\s/u);
    expect(boundValues).toContain(JSON.stringify(mailboxIds));
    expect(boundValues.length).toBeLessThan(100);
  });
});
