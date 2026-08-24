// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactsPage } from "@/features/contacts/contacts-page";
import { flushHookEffects, renderComponent } from "../render-hook";

const mocks = vi.hoisted(() => ({
  getContact: vi.fn(),
  listContacts: vi.fn(),
  removeContact: vi.fn(),
  saveContact: vi.fn()
}));

vi.mock("@/features/contacts/api", () => mocks);

const detail = {
  contact: {
    email: "alice@example.com",
    id: "alice@example.com",
    lastContactAt: "2026-08-24T12:00:00.000Z",
    name: "Alice",
    notes: "Prefers email in the morning.",
    saved: true,
    source: "saved" as const
  },
  conversations: [
    {
      createdAt: "2026-08-24T12:00:00.000Z",
      direction: "inbound" as const,
      folder: "inbox" as const,
      fromAddress: "alice@example.com",
      hasAttachments: false,
      id: "message-1",
      isStarred: false,
      mailboxId: "mailbox-1",
      messageCount: 2,
      readAt: null,
      receivedAt: "2026-08-24T12:00:00.000Z",
      sentAt: null,
      snippet: "Can we talk tomorrow?",
      starredAt: null,
      subject: "Project timing",
      threadId: "thread-1",
      to: ["support@example.com"],
      unreadCount: 1
    }
  ]
};

describe("contacts page", () => {
  beforeEach(() => {
    mocks.getContact.mockReset().mockResolvedValue(detail);
    mocks.listContacts.mockReset().mockResolvedValue([]);
    mocks.removeContact.mockReset().mockResolvedValue(undefined);
    mocks.saveContact.mockReset().mockResolvedValue(detail);
  });

  it("shows private notes, exact exchanges, and the normal compose action", async () => {
    const onCompose = vi.fn();
    const onOpenConversation = vi.fn();
    const view = await renderComponent(
      <ContactsPage
        selectedId="alice@example.com"
        onBack={() => undefined}
        onCompose={onCompose}
        onOpenConversation={onOpenConversation}
        onSelect={() => undefined}
      />
    );
    await flushHookEffects();

    expect(view.container.textContent).toContain("Private contact details");
    expect(view.container.querySelector<HTMLTextAreaElement>("#contact-notes")?.value).toBe(
      "Prefers email in the morning."
    );
    expect(view.container.textContent).toContain("Project timing");
    expect(view.container.textContent).toContain("Can we talk tomorrow?");

    const newEmail = Array.from(view.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("New email")
    );
    await flushHookEffects(() => newEmail?.click());
    expect(onCompose).toHaveBeenCalledWith("alice@example.com");

    const exchange = Array.from(view.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Project timing")
    );
    await flushHookEffects(() => exchange?.click());
    expect(onOpenConversation).toHaveBeenCalledWith(
      expect.objectContaining({ folder: "inbox", id: "message-1" })
    );
    await view.unmount();
  });
});
