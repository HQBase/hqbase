// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Mailbox } from "@/features/mailboxes/types";
import {
  createSignature,
  deleteSignature,
  listManagedSignatures,
  updateSignature
} from "@/features/signatures/api";
import { SignatureSettings } from "@/features/signatures/signature-settings";
import type { Signature } from "@/features/signatures/types";
import { flushHookEffects, renderComponent } from "../render-hook";

vi.mock("@/features/signatures/api", () => ({
  createSignature: vi.fn(),
  deleteSignature: vi.fn(),
  listManagedSignatures: vi.fn(),
  parseSignatureScope: (value: string) => {
    const [type, id] = value.split(":");
    return { type, id };
  },
  signatureScopeValue: ({ type, id }: { type: string; id: string }) => `${type}:${id}`,
  updateSignature: vi.fn()
}));
vi.mock("@/features/compose/rich-email-editor", () => ({
  RichEmailEditor: ({
    html,
    onChange
  }: {
    html: string;
    onChange: (html: string, text: string) => void;
  }) => (
    <textarea
      aria-label="Signature content"
      value={html}
      onChange={(event) =>
        onChange(event.target.value, event.target.value.replace(/<[^>]+>/gu, "").trim())
      }
    />
  )
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const signature: Signature = {
  id: "sig_personal",
  name: "Personal",
  html: "<p>Alex</p>",
  text: "Alex",
  scope: "user",
  scopeId: "usr_alex",
  scopeLabel: "Personal",
  isDefault: true,
  createdAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-24T12:00:00.000Z"
};
const mailbox: Mailbox = {
  id: "mbx_support",
  address: "support@example.com",
  mailDomainId: "dom_example",
  displayName: "Support",
  kind: "human",
  isActive: true,
  deletedAt: null,
  accessLevel: "manager",
  createdAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-24T12:00:00.000Z"
};

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("signature settings", () => {
  it("creates a personal signature and offers managed shared scopes", async () => {
    vi.mocked(listManagedSignatures).mockResolvedValue([]);
    vi.mocked(createSignature).mockResolvedValue(signature);
    const view = await renderSettings();

    const add = findButton(view.container, "Add signature");
    await flushHookEffects(() => add.click());
    expect(document.body.textContent).toContain("Use simple formatting");

    await openScopeMenu();
    expect(document.body.textContent).toContain("Personal");
    expect(document.body.textContent).toContain("Mailbox · Support · support@example.com");
    expect(document.body.textContent).toContain("Exact domain · example.com");
    await flushHookEffects(() =>
      document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))
    );

    await flushHookEffects(() => {
      setInput(document.body, "#signature-name", "Regards");
      setTextarea(document.body, '[aria-label="Signature content"]', "<p>Alex</p>");
    });
    await flushHookEffects(() => document.body.querySelector("form")?.requestSubmit());

    expect(createSignature).toHaveBeenCalledWith({
      name: "Regards",
      html: "<p>Alex</p>",
      scope: { type: "user", id: "usr_alex" },
      isDefault: false
    });
    await view.unmount();
  });

  it("updates and deletes an existing signature", async () => {
    vi.mocked(listManagedSignatures).mockResolvedValue([signature]);
    vi.mocked(updateSignature).mockResolvedValue({ ...signature, name: "Main" });
    vi.mocked(deleteSignature).mockResolvedValue(undefined);
    const view = await renderSettings();
    expect(
      Array.from(view.container.querySelectorAll("th")).map((header) => header.textContent)
    ).toEqual(["Name", "Scope", "Default", "Actions"]);
    expect(
      view.container.querySelector<HTMLElement>('[data-slot="table-container"]')?.className
    ).toContain("rounded-lg border");
    const row = view.container
      .querySelector<HTMLButtonElement>('[aria-label="Edit Personal"]')
      ?.closest("tr");
    expect(row?.textContent).toContain("Personal");
    expect(row?.textContent).toContain("Default");

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Edit Personal"]')?.click()
    );
    await flushHookEffects(() => {
      setInput(document.body, "#signature-name", "Main");
      setTextarea(document.body, '[aria-label="Signature content"]', "<p>Alex B.</p>");
    });
    await flushHookEffects(() => document.body.querySelector("form")?.requestSubmit());
    expect(updateSignature).toHaveBeenCalledWith(signature.id, {
      name: "Main",
      html: "<p>Alex B.</p>",
      isDefault: true
    });

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Delete Personal"]')?.click()
    );
    expect(document.body.textContent).toContain("Saved drafts keep their current copy");
    await flushHookEffects(() => findButton(document.body, "Delete signature").click());
    expect(deleteSignature).toHaveBeenCalledWith(signature.id);
    await view.unmount();
  });
});

async function renderSettings() {
  const view = await renderComponent(
    <SignatureSettings
      domains={[{ id: "dom_example", name: "example.com", isEnabled: true }]}
      mailboxes={[mailbox]}
      user={{ id: "usr_alex", role: "owner" }}
    />
  );
  document.body.appendChild(view.container);
  await flushHookEffects();
  return view;
}

async function openScopeMenu(): Promise<void> {
  await flushHookEffects(() =>
    document.body.querySelector<HTMLButtonElement>('[aria-label="Signature scope"]')?.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        ctrlKey: false,
        pointerType: "mouse"
      })
    )
  );
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent === label
  );
  if (!button) throw new Error(`Expected button ${label}`);
  return button;
}

function setInput(container: HTMLElement, selector: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Expected input ${selector}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setTextarea(container: HTMLElement, selector: string, value: string): void {
  const textarea = container.querySelector<HTMLTextAreaElement>(selector);
  if (!textarea) throw new Error(`Expected textarea ${selector}`);
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
    textarea,
    value
  );
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
