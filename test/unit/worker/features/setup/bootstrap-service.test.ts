import type { WorkerEnv } from "@worker/lib/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMailbox: vi.fn(),
  getSetupStatus: vi.fn(),
  setChecklistAcknowledged: vi.fn(),
  setDefaultFromMailboxId: vi.fn(),
  setPrimaryDomain: vi.fn(),
  setSetupComplete: vi.fn(),
  signUpOwnerUser: vi.fn(),
  upsertMailDomain: vi.fn(),
  upsertWorkspaceHost: vi.fn()
}));

vi.mock("@worker/auth/user-actions", () => ({ signUpOwnerUser: mocks.signUpOwnerUser }));
vi.mock("@worker/features/domains/queries", () => ({ upsertMailDomain: mocks.upsertMailDomain }));
vi.mock("@worker/features/mailboxes/service", () => ({ createMailbox: mocks.createMailbox }));
vi.mock("@worker/features/preferences/queries", () => ({
  setDefaultFromMailboxId: mocks.setDefaultFromMailboxId
}));
vi.mock("@worker/features/setup/queries", () => ({
  getSetupStatus: mocks.getSetupStatus,
  setChecklistAcknowledged: mocks.setChecklistAcknowledged,
  setPrimaryDomain: mocks.setPrimaryDomain,
  setSetupComplete: mocks.setSetupComplete,
  upsertWorkspaceHost: mocks.upsertWorkspaceHost
}));

import { bootstrapSetup } from "@worker/features/setup/service";

describe("setup bootstrap service validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSetupStatus.mockResolvedValue({ isComplete: false, userCount: 0 });
  });

  it("rejects a missing default From mailbox before creating sending-enabled setup records", async () => {
    const env = { DB: {} as D1Database } as WorkerEnv;

    await expect(
      bootstrapSetup(env, new Request("https://hqbase.test/api/setup/bootstrap"), {
        checklistAcknowledged: true,
        defaultFromMailboxAddress: null,
        emailDomains: [{ name: "example.com", sendingStatus: "ready" }],
        mailboxes: [{ address: "support@example.com", displayName: "Support" }],
        ownerEmail: "owner@gmail.com",
        ownerName: "Owner",
        ownerPassword: "password123"
      })
    ).rejects.toMatchObject({ code: "DEFAULT_FROM_MAILBOX_REQUIRED", status: 400 });

    expect(mocks.upsertMailDomain).not.toHaveBeenCalled();
    expect(mocks.signUpOwnerUser).not.toHaveBeenCalled();
  });
});
