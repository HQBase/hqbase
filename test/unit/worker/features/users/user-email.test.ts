import { sendPasswordSetupEmail } from "@worker/features/users/email";
import type { WorkerEnv } from "@worker/lib/env";
import { describe, expect, it, vi } from "vitest";

describe("user onboarding email", () => {
  it("sends an invitation from an active workspace mailbox and records delivery", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "<invite@example.com>" });
    const run = vi.fn().mockResolvedValue({ success: true });
    const db = database({
      onboarding: { method: "email_invite", status: "pending" },
      sender: { address: "support@example.com" },
      run
    });

    await sendPasswordSetupEmail(environment(db, send), {
      user: { id: "user-1", email: "person@gmail.com", name: "Avery <Stone>" },
      url: "https://mail.example.com/api/auth/reset-password/token?callbackURL=welcome"
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: "HQBase", email: "support@example.com" },
        subject: "You’ve been invited to HQBase",
        to: "person@gmail.com"
      })
    );
    const message = send.mock.calls[0]?.[0] as { html: string; text: string };
    expect(message.text).toContain("This link expires in seven days");
    expect(message.html).toContain("Avery &lt;Stone&gt;");
    expect(message.html).not.toContain("Avery <Stone>");
    expect(run).toHaveBeenCalledOnce();
  });

  it("fails without exposing a link when no sending mailbox is available", async () => {
    const send = vi.fn();
    const db = database({
      onboarding: { method: "email_invite", status: "pending" },
      sender: null,
      run: vi.fn()
    });

    await expect(
      sendPasswordSetupEmail(environment(db, send), {
        user: { id: "user-1", email: "person@gmail.com", name: "Avery" },
        url: "https://mail.example.com/private-token"
      })
    ).rejects.toThrow("Connect an active sending mailbox");
    expect(send).not.toHaveBeenCalled();
  });
});

function database(input: {
  onboarding: { method: "email_invite"; status: "pending" };
  sender: { address: string } | null;
  run: ReturnType<typeof vi.fn>;
}): D1Database {
  return {
    prepare: vi.fn((sql: string) => {
      const statement = {
        bind: vi.fn(() => statement),
        first: vi.fn(async () =>
          sql.includes("FROM mailbox_addresses") ? input.sender : input.onboarding
        ),
        run: input.run
      };
      return statement;
    })
  } as unknown as D1Database;
}

function environment(db: D1Database, send: ReturnType<typeof vi.fn>): WorkerEnv {
  return {
    DB: db,
    MAIL_SENDER: { send } as unknown as SendEmail
  } as WorkerEnv;
}
