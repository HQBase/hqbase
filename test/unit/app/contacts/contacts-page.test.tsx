// @vitest-environment happy-dom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactRow } from "@/features/contacts/contact-views";
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
    savedName: "Alice",
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
  ],
  nextCursor: null
};

describe("contacts page", () => {
  beforeEach(() => {
    mocks.getContact.mockReset().mockResolvedValue(detail);
    mocks.listContacts.mockReset().mockResolvedValue([]);
    mocks.removeContact.mockReset().mockResolvedValue(undefined);
    mocks.saveContact.mockReset().mockResolvedValue(detail);
  });

  it("uses the inbox row surface and hover tokens", () => {
    const html = renderToStaticMarkup(
      <ContactRow contact={detail.contact} onSelect={() => undefined} />
    );

    expect(html).toContain("rounded-xl");
    expect(html).toContain("hover:bg-hover");
    expect(html).toContain("py-3");
    expect(html).toContain("sm:py-2");
    expect(html).not.toContain("border-b");
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
    expect(exchange?.className).toContain("hover:bg-hover");
    expect(exchange?.className).toContain("sm:py-2");
    expect(view.container.firstElementChild?.className).toContain("bg-list");
    await flushHookEffects(() => exchange?.click());
    expect(onOpenConversation).toHaveBeenCalledWith(
      expect.objectContaining({ folder: "inbox", id: "message-1" })
    );
    await view.unmount();
  });

  it("does not persist an observed sender name during a notes-only save", async () => {
    const observed = {
      ...detail,
      contact: {
        ...detail.contact,
        name: "Alice Header",
        notes: "Observed contact note.",
        saved: false,
        savedName: null,
        source: "recent" as const
      }
    };
    mocks.getContact.mockResolvedValue(observed);
    mocks.saveContact.mockResolvedValue(observed);
    const view = await renderComponent(
      <ContactsPage
        selectedId="alice@example.com"
        onBack={() => undefined}
        onCompose={() => undefined}
        onOpenConversation={() => undefined}
        onSelect={() => undefined}
      />
    );
    await flushHookEffects();

    const name = view.container.querySelector<HTMLInputElement>("#contact-name");
    expect(name?.value).toBe("");
    expect(name?.placeholder).toBe("Alice Header");
    const save = Array.from(view.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Save contact")
    );
    await flushHookEffects(() => save?.click());
    expect(mocks.saveContact).toHaveBeenCalledWith("alice@example.com", {
      email: "alice@example.com",
      name: null,
      notes: "Observed contact note."
    });
    await view.unmount();
  });

  it("loads every older exchange through the contact cursor", async () => {
    const older = {
      ...detail.conversations[0],
      id: "message-older",
      threadId: "thread-older",
      subject: "Earlier project note"
    };
    mocks.getContact
      .mockReset()
      .mockResolvedValueOnce({ ...detail, nextCursor: "contact-cursor" })
      .mockResolvedValueOnce({ ...detail, conversations: [older], nextCursor: null });
    const view = await renderComponent(
      <ContactsPage
        selectedId="alice@example.com"
        onBack={() => undefined}
        onCompose={() => undefined}
        onOpenConversation={() => undefined}
        onSelect={() => undefined}
      />
    );
    await flushHookEffects();

    const loadMore = Array.from(view.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Load more exchanges")
    );
    await flushHookEffects(() => loadMore?.click());

    expect(mocks.getContact).toHaveBeenLastCalledWith("alice@example.com", "contact-cursor");
    expect(view.container.textContent).toContain("Earlier project note");
    await view.unmount();
  });

  it("does not append an older page after another contact opens", async () => {
    const baseConversation = detail.conversations.at(0);
    if (!baseConversation) throw new Error("Expected the contact fixture to include an exchange.");
    const older = {
      ...baseConversation,
      id: "message-older",
      threadId: "thread-older",
      subject: "Alice-only older exchange"
    };
    const bobDetail = {
      ...detail,
      contact: {
        ...detail.contact,
        email: "bob@example.com",
        id: "bob@example.com",
        name: "Bob"
      },
      conversations: [
        {
          ...baseConversation,
          fromAddress: "bob@example.com",
          id: "message-bob",
          subject: "Bob exchange",
          threadId: "thread-bob"
        }
      ]
    };
    let resolveOlder: (value: typeof detail) => void = () => undefined;
    const olderRequest = new Promise<typeof detail>((resolve) => {
      resolveOlder = resolve;
    });
    mocks.getContact.mockReset().mockImplementation((contactId: string, cursor?: string) => {
      if (contactId === "alice@example.com" && cursor === "contact-cursor") {
        return olderRequest;
      }
      if (contactId === "bob@example.com") return Promise.resolve(bobDetail);
      return Promise.resolve({ ...detail, nextCursor: "contact-cursor" });
    });
    const props = {
      onBack: () => undefined,
      onCompose: () => undefined,
      onOpenConversation: () => undefined,
      onSelect: () => undefined
    };
    const view = await renderComponent(<ContactsPage {...props} selectedId="alice@example.com" />);
    await flushHookEffects();

    const loadMore = Array.from(view.container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Load more exchanges")
    );
    await flushHookEffects(() => loadMore?.click());
    await view.rerender(<ContactsPage {...props} selectedId="bob@example.com" />);
    await flushHookEffects();
    expect(view.container.textContent).toContain("Bob exchange");

    await flushHookEffects(() =>
      resolveOlder({ ...detail, conversations: [older], nextCursor: null })
    );
    expect(view.container.textContent).toContain("Bob exchange");
    expect(view.container.textContent).not.toContain("Alice-only older exchange");
    await view.unmount();
  });
});
