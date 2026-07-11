import {
  canManageMailboxes,
  canManageUsers,
  canReadMail,
  canSendMail
} from "@worker/auth/permissions";
import { describe, expect, it } from "vitest";

describe("permissions", () => {
  it("allows owner and admin to manage users and mailboxes", () => {
    expect(canManageUsers("owner")).toBe(true);
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageMailboxes("owner")).toBe(true);
    expect(canManageMailboxes("admin")).toBe(true);
  });

  it("allows members to read and send but not manage", () => {
    expect(canReadMail("member")).toBe(true);
    expect(canSendMail("member")).toBe(true);
    expect(canManageUsers("member")).toBe(false);
    expect(canManageMailboxes("member")).toBe(false);
  });
});
