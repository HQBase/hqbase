import {
  accessAllows,
  accessibleMailboxIds,
  mailboxAccess,
  requireMailboxAccess
} from "@worker/auth/mailbox-access";
import { describe, expect, it } from "vitest";

describe("mailbox access levels", () => {
  const db = {
    prepare(sql: string) {
      const statement = {
        bind: () => statement,
        first: async () => ({ access_level: "read" }),
        all: async () => ({
          results: sql.includes("SELECT id FROM mailboxes")
            ? [{ id: "mbx_owner" }]
            : [{ mailbox_id: "mbx_member" }]
        })
      };
      return statement;
    }
  } as unknown as D1Database;

  it("enforces the read-agent-manager hierarchy", () => {
    expect(accessAllows(null, "read")).toBe(false);
    expect(accessAllows("read", "read")).toBe(true);
    expect(accessAllows("read", "agent")).toBe(false);
    expect(accessAllows("agent", "read")).toBe(true);
    expect(accessAllows("agent", "manager")).toBe(false);
    expect(accessAllows("manager", "agent")).toBe(true);
  });

  it("gives owners implicit manager access and resolves member grants", async () => {
    await expect(mailboxAccess(db, "owner", "owner", "mbx_1")).resolves.toBe("manager");
    await expect(mailboxAccess(db, "member", "member", "mbx_1")).resolves.toBe("read");
    await expect(requireMailboxAccess(db, "member", "member", "mbx_1", "read")).resolves.toBe(
      "read"
    );
    await expect(
      requireMailboxAccess(db, "member", "member", "mbx_1", "agent")
    ).rejects.toMatchObject({ code: "MAILBOX_FORBIDDEN", status: 403 });
  });

  it("lists only mailbox IDs satisfying the required level", async () => {
    await expect(accessibleMailboxIds(db, "owner", "owner", "read")).resolves.toEqual([
      "mbx_owner"
    ]);
    await expect(accessibleMailboxIds(db, "member", "member", "read")).resolves.toEqual([
      "mbx_member"
    ]);
  });
});
