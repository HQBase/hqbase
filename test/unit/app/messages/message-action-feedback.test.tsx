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
  it("keeps thread labels in the responsive reader controls", async () => {
    const onToggleLabel = vi.fn();
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
        onToggleLabel={onToggleLabel}
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
    const desktopLabels = view.container.querySelector<HTMLButtonElement>(
      '[data-reader-labels="desktop"] [aria-label="Labels: Customer"]'
    );
    const mobileLabels = view.container.querySelector<HTMLButtonElement>(
      '[data-reader-labels="mobile"] [aria-label="Labels: Customer"]'
    );
    const more = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="More conversation actions"]'
    );

    expect(unread?.className).toContain("hidden sm:inline-flex");
    expect(trash?.className).toContain("hidden sm:inline-flex");
    expect(star?.className).not.toContain("hidden sm:inline-flex");
    expect(archive?.className).toContain("hidden sm:inline-flex");
    const desktopWrapper = desktopLabels?.closest<HTMLElement>('[data-reader-labels="desktop"]');
    const mobileWrapper = mobileLabels?.closest<HTMLElement>('[data-reader-labels="mobile"]');
    expect(desktopWrapper?.className).toContain("hidden");
    expect(desktopWrapper?.className).toContain("sm:block");
    expect(desktopWrapper?.parentElement).toBe(unread?.parentElement);
    expect(
      [...(unread?.parentElement?.children ?? [])].indexOf(desktopWrapper as Element)
    ).toBeLessThan([...(unread?.parentElement?.children ?? [])].indexOf(unread as Element));
    expect(desktopLabels?.className).toContain("h-10");
    expect(desktopLabels?.className).toContain("rounded-md");
    expect(desktopLabels?.className).toContain("bg-transparent");
    expect(desktopLabels?.className).toContain("px-2");
    expect(desktopLabels?.className).toContain("flex-row-reverse");
    expect(desktopLabels?.querySelector('[data-label-menu-icon="tag"]')).not.toBeNull();
    expect(mobileWrapper?.className).toContain("flex justify-end");
    expect(mobileWrapper?.className).toContain("pt-1.5");
    expect(mobileWrapper?.className).toContain("pb-0");
    expect(mobileWrapper?.className).toContain("sm:hidden");
    expect(mobileLabels?.className).toContain("bg-muted/40");
    expect(mobileLabels?.className).toContain("px-1");
    expect(
      view.container.querySelector("[data-thread-message-id] header [data-reader-labels]")
    ).toBeNull();
    expect(
      view.container.querySelector<HTMLElement>("[data-thread-message-id]")?.className
    ).toContain("pt-2");
    expect(more?.className).toContain("sm:hidden");

    await flushHookEffects(() => {
      more?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      more?.click();
    });

    const menu = document.body.querySelector<HTMLElement>("[data-mobile-thread-actions]");
    expect(menu?.textContent).not.toContain("Labels");
    expect(menu?.textContent).not.toContain("Star conversation");
    expect(menu?.querySelector('[data-mobile-thread-action="star"]')).toBeNull();
    expect(menu?.querySelector('[data-mobile-thread-action="read"]')).not.toBeNull();
    expect(menu?.querySelector('[data-mobile-thread-action="archive"]')).not.toBeNull();
    expect(menu?.querySelector('[data-mobile-thread-action="trash"]')).not.toBeNull();
    expect(menu?.textContent).toContain("Mark conversation read");
    expect(menu?.textContent).toContain("Trash conversation");

    await flushHookEffects(() => {
      desktopLabels?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      desktopLabels?.click();
    });
    const labelItem = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')
    ].find((item) => item.textContent?.includes("Customer"));
    await flushHookEffects(() => labelItem?.click());
    expect(onToggleLabel).toHaveBeenCalledWith(customerLabel, false);
    await view.unmount();
  });

  it("keeps the reader label icon for empty and read-only assignments", async () => {
    const editable = await renderComponent(
      <MessageDetail
        canOrganizeLabels
        defaultFromMailboxId="mbx_1"
        labels={[customerLabel]}
        mailboxes={[]}
        messages={[message]}
        selectedId={message.id}
        onAction={() => undefined}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onSent={() => undefined}
        onToggleLabel={() => undefined}
      />
    );
    const desktopEmpty = editable.container.querySelector<HTMLButtonElement>(
      '[data-reader-labels="desktop"] [aria-label="Add label"]'
    );
    const mobileEmpty = editable.container.querySelector<HTMLButtonElement>(
      '[data-reader-labels="mobile"] [aria-label="Add label"]'
    );
    expect(desktopEmpty?.textContent).toContain("Add label");
    expect(desktopEmpty?.className).toContain("h-10");
    expect(desktopEmpty?.className).toContain("bg-transparent");
    expect(desktopEmpty?.className).not.toContain("border-dashed");
    expect(mobileEmpty?.textContent).toContain("Add label");
    expect(mobileEmpty?.className).toContain("border-dashed");
    expect(mobileEmpty?.className).toContain("border-divider");
    expect(mobileEmpty?.className).toContain("flex-row-reverse");
    expect(mobileEmpty?.className).toContain("px-1");
    expect(mobileEmpty?.querySelector('[data-label-menu-icon="tag"]')).not.toBeNull();
    await editable.unmount();

    const readOnly = await renderComponent(
      <MessageDetail
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
    const staticControl = readOnly.container.querySelector<HTMLElement>(
      '[data-reader-labels="desktop"]'
    );
    const staticPill = staticControl?.firstElementChild;
    expect(staticControl?.textContent).toContain("Customer");
    expect(staticControl?.querySelector("svg")).not.toBeNull();
    expect(staticControl?.querySelector("button")).toBeNull();
    expect(staticPill?.className).toContain("gap-1.5");
    expect(staticPill?.className).toContain("px-2");
    expect(staticPill?.className).toContain("h-10");
    expect(staticPill?.firstElementChild?.tagName).toBe("svg");
    expect(staticPill?.firstElementChild?.getAttribute("class")).toContain("-translate-y-px");
    await readOnly.unmount();
  });

  it("uses the compact Mark Unread label in mobile More", async () => {
    const view = await renderComponent(
      <MessageDetail
        defaultFromMailboxId="mbx_1"
        mailboxes={[]}
        messages={[{ ...message, readAt: "2026-07-27T14:01:00.000Z" }]}
        selectedId={message.id}
        onAction={() => undefined}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onSent={() => undefined}
      />
    );
    const more = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="More conversation actions"]'
    );
    await flushHookEffects(() => {
      more?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      more?.click();
    });
    const menu = document.body.querySelector<HTMLElement>("[data-mobile-thread-actions]");
    expect(menu?.textContent).toContain("Mark Unread");
    expect(menu?.textContent).not.toContain("Mark conversation unread");
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
      expect(document.body.querySelector('[data-mobile-thread-action="read"]')).not.toBeNull();
      expect(document.body.querySelector('[data-mobile-thread-action="star"]')).toBeNull();
      expect(document.body.querySelector('[data-mobile-thread-action="labels"]')).toBeNull();
      expect(document.body.querySelector('[data-mobile-thread-action="trash"]') !== null).toBe(
        testCase.folder !== "trash"
      );
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
