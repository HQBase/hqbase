// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailboxDetailsSheet } from "@/features/mailboxes/mailbox-details-sheet";
import { flushHookEffects, renderComponent } from "../render-hook";

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  updateMailbox: vi.fn()
}));

vi.mock("@/features/mailboxes/api", () => ({ updateMailbox: mocks.updateMailbox }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: mocks.toastSuccess }
}));

const mailbox = {
  id: "mbx_1",
  address: "support@example.com",
  mailDomainId: "dom_1",
  displayName: "Support",
  kind: "human" as const,
  isActive: true,
  deletedAt: null,
  accessLevel: "manager" as const,
  createdAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-24T12:00:00.000Z"
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mailbox details sender name", () => {
  it("updates the shared outbound identity and refreshes mailbox state", async () => {
    mocks.updateMailbox.mockReset().mockResolvedValue({ ...mailbox, displayName: "Customer Care" });
    mocks.toastSuccess.mockReset();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const view = await renderComponent(
      <MailboxDetailsSheet
        canManage
        mailbox={mailbox}
        policies={{
          grants: [],
          busy: null,
          loading: false,
          applyMany: vi.fn(),
          change: vi.fn()
        }}
        users={[]}
        onChanged={refresh}
        onDelete={() => undefined}
        onManageAccess={() => undefined}
        onOpenChange={() => undefined}
      />
    );

    const input = document.body.querySelector<HTMLInputElement>("#mailbox-sender-name");
    expect(input?.value).toBe("Support");
    await flushHookEffects(() => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "Customer Care"
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save"
    );
    await flushHookEffects(() => save?.click());

    expect(mocks.updateMailbox).toHaveBeenCalledWith("mbx_1", { displayName: "Customer Care" });
    expect(refresh).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Sender name updated.");
    await view.unmount();
  });
});
