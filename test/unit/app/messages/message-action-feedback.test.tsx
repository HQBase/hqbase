// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn()
}));

vi.mock("sonner", () => ({ toast: mocks }));

import type { MailLabel } from "@/features/labels/types";
import { MessageDetail } from "@/features/messages/message-detail";
import type { MessageDetail as MessageDetailType } from "@/features/messages/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const message: MessageDetailType = {
  id: "msg_1",
  threadId: "thr_1",
  mailboxId: "mbx_1",
  direction: "inbound",
  folder: "inbox",
  fromAddress: "customer@example.com",
  to: ["support@example.com"],
  cc: [],
  bcc: [],
  deliveredToAddress: "support@example.com",
  subject: "Account access",
  snippet: "I cannot sign in",
  textBody: "I cannot sign in.",
  htmlAvailable: false,
  messageId: "<first@example.com>",
  inReplyTo: null,
  references: [],
  attachments: [],
  receivedAt: "2026-07-27T14:00:00.000Z",
  sentAt: null,
  readAt: null,
  starredAt: null,
  hasAttachments: false,
  createdAt: "2026-07-27T14:00:00.000Z"
};

const customerLabel: MailLabel = {
  color: "blue",
  createdAt: "2026-08-24T12:00:00.000Z",
  id: "label-customer",
  name: "Customer",
  updatedAt: "2026-08-24T12:00:00.000Z"
};

beforeEach(() => vi.clearAllMocks());

describe("conversation action feedback", () => {
  it("keeps unread and Trash visible and moves the other mobile actions into More", async () => {
    const view = await renderComponent(
      <MessageDetail
        canOrganizeLabels
        defaultFromMailboxId="mbx_1"
        labels={[customerLabel]}
        mailboxes={[]}
        messages={[{ ...message, labels: [customerLabel] }]}
        selectedId={message.id}
        onAction={() => undefined}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onSent={() => undefined}
        onToggleLabel={() => undefined}
      />
    );

    const unread = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Mark conversation read"]'
    );
    const trash = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Trash conversation"]'
    );
    const star = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Star conversation"]'
    );
    const archive = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Archive conversation"]'
    );
    const labels = view.container.querySelector<HTMLButtonElement>('[aria-label="Labels"]');
    const more = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="More conversation actions"]'
    );

    expect(unread?.className).not.toContain("sm:hidden");
    expect(trash?.className).not.toContain("sm:hidden");
    expect(star?.className).toContain("hidden sm:inline-flex");
    expect(archive?.className).toContain("hidden sm:inline-flex");
    expect(labels?.className).toContain("hidden sm:inline-flex");
    expect(labels?.querySelector('[data-label-menu-icon="tag"]')).not.toBeNull();
    expect(more?.className).toContain("sm:hidden");

    await flushHookEffects(() => {
      more?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      more?.click();
    });

    const menu = document.body.querySelector<HTMLElement>("[data-mobile-thread-actions]");
    expect(menu?.textContent).toContain("Labels");
    expect(menu?.textContent).not.toContain("Customer");
    expect(menu?.querySelector('[role="menuitemcheckbox"]')).toBeNull();
    expect(menu?.querySelector('[data-mobile-thread-action="star"]')).not.toBeNull();
    expect(menu?.querySelector('[data-mobile-thread-action="archive"]')).not.toBeNull();
    expect(menu?.textContent).not.toContain("Mark conversation read");
    expect(menu?.textContent).not.toContain("Trash conversation");
    let labelToggle = menu?.querySelector<HTMLElement>('[data-mobile-thread-action="labels"]');
    expect(labelToggle?.getAttribute("aria-expanded")).toBe("false");
    await flushHookEffects(() => labelToggle?.click());
    expect(labelToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(menu?.textContent).toContain("Customer");
    expect(menu?.querySelector('[role="menuitemcheckbox"]')).not.toBeNull();
    await flushHookEffects(() => labelToggle?.click());
    labelToggle = menu?.querySelector<HTMLElement>('[data-mobile-thread-action="labels"]');
    expect(labelToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(menu?.textContent).not.toContain("Customer");
    expect(menu?.querySelector('[role="menuitemcheckbox"]')).toBeNull();
    expect(document.body.querySelector("[data-mobile-thread-actions]")).not.toBeNull();
    await flushHookEffects(() => labelToggle?.click());
    const labelItem = [
      ...(menu?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]') ?? [])
    ].find((item) => item.textContent?.includes("Customer"));
    await flushHookEffects(() => labelItem?.click());
    expect(document.body.querySelector("[data-mobile-thread-actions]")).not.toBeNull();
    await view.unmount();
  });

  it("moves Restore and Unarchive into More in their folders", async () => {
    const cases = [
      { action: "restore", folder: "trash", label: "Restore conversation" },
      { action: "unarchive", folder: "archived", label: "Unarchive conversation" }
    ] as const;

    for (const testCase of cases) {
      const view = await renderComponent(
        <MessageDetail
          activeFolder={testCase.folder}
          defaultFromMailboxId="mbx_1"
          mailboxes={[]}
          messages={[{ ...message, folder: testCase.folder }]}
          selectedId={message.id}
          onAction={() => undefined}
          onBack={() => undefined}
          onRefresh={() => undefined}
          onSent={() => undefined}
        />
      );
      const folderAction = view.container.querySelector<HTMLButtonElement>(
        `[aria-label="${testCase.label}"]`
      );
      const more = view.container.querySelector<HTMLButtonElement>(
        '[aria-label="More conversation actions"]'
      );

      expect(folderAction?.className).toContain("hidden sm:inline-flex");
      await flushHookEffects(() => {
        more?.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
        );
        more?.click();
      });
      expect(
        document.body.querySelector(`[data-mobile-thread-action="${testCase.action}"]`)
      ).not.toBeNull();
      await view.unmount();
    }
  });

  it("shows success only after the action resolves", async () => {
    let resolveAction: (() => void) | undefined;
    const action = new Promise<void>((resolve) => {
      resolveAction = resolve;
    });
    const view = await renderComponent(
      <MessageDetail
        defaultFromMailboxId="mbx_1"
        mailboxes={[]}
        messages={[message]}
        selectedId={message.id}
        onAction={() => action}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onSent={() => undefined}
      />
    );

    await flushHookEffects(() =>
      view.container
        .querySelector<HTMLButtonElement>('[aria-label="Archive conversation"]')
        ?.click()
    );
    expect(mocks.success).not.toHaveBeenCalled();

    await flushHookEffects(() => resolveAction?.());
    expect(mocks.success).toHaveBeenCalledWith("Conversation archived.");
    expect(mocks.error).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("reports an action failure without a success message", async () => {
    const view = await renderComponent(
      <MessageDetail
        defaultFromMailboxId="mbx_1"
        mailboxes={[]}
        messages={[message]}
        selectedId={message.id}
        onAction={() => Promise.reject(new Error("offline"))}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onSent={() => undefined}
      />
    );

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Trash conversation"]')?.click()
    );
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("The conversation could not be updated. Try again.");
    await view.unmount();
  });
});
