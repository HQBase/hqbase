// @vitest-environment happy-dom
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ComposeDialogProps } from "@/features/compose/compose-state";
import type { MessageDetail } from "@/features/messages/types";
import type { AppRoute } from "@/lib/routes";

vi.mock("@/features/compose/compose-dialog", async () => {
  const { createPortal } = await import("react-dom");
  return {
    ComposeDialog: (props: ComposeDialogProps) => {
      const content = (
        <section
          data-compose-dock-index={props.dockIndex}
          data-compose-draft-id={props.draftId ?? ""}
          data-compose-inline={props.inlineTarget ? "true" : "false"}
          data-compose-minimized={props.minimized ? "true" : "false"}
          data-compose-mode={props.mode}
          data-compose-presentation={props.presentation}
          data-compose-to={props.initialTo}
          data-compose-window-slot={props.windowSlot}
        >
          <input aria-label={`Composer ${props.initialTo || props.mode}`} defaultValue="initial" />
          {props.onDetach ? (
            <button data-compose-action="detach" type="button" onClick={props.onDetach}>
              Detach
            </button>
          ) : null}
          {props.onReturnToThread ? (
            <button data-compose-action="return" type="button" onClick={props.onReturnToThread}>
              Return
            </button>
          ) : null}
          <button
            data-compose-action="minimize"
            type="button"
            onClick={() => props.onMinimizedChange?.(true)}
          >
            Minimize
          </button>
          <button
            data-compose-action="ready"
            type="button"
            onClick={() => props.onDraftReady?.(`draft-${props.initialTo || props.mode}`)}
          >
            Ready
          </button>
        </section>
      );
      return props.minimized && props.dockTarget
        ? createPortal(content, props.dockTarget)
        : content;
    }
  };
});

import { ComposerHost, ComposerInlineTarget, useComposer } from "@/features/compose/composer-host";
import { flushHookEffects, renderComponent } from "../render-hook";

const originRoute: AppRoute = { kind: "mail", folder: "inbox", messageId: "msg-1" };
const settingsRoute: AppRoute = { kind: "settings", tab: "mailboxes" };

const message: MessageDetail = {
  id: "msg-1",
  threadId: "thread-1",
  mailboxId: "mailbox-1",
  direction: "inbound",
  folder: "inbox",
  fromAddress: "reader@example.net",
  to: ["support@example.com"],
  cc: [],
  bcc: [],
  deliveredToAddress: "support@example.com",
  subject: "Question",
  snippet: "Hello",
  textBody: "Hello",
  htmlAvailable: false,
  messageId: "<msg-1@example.net>",
  inReplyTo: null,
  references: [],
  attachments: [],
  receivedAt: "2026-08-24T12:00:00.000Z",
  sentAt: null,
  readAt: null,
  starredAt: null,
  hasAttachments: false,
  createdAt: "2026-08-24T12:00:00.000Z"
};

function Controls({ showInlineTarget = false }: { showInlineTarget?: boolean }) {
  const composer = useComposer();
  const first = composer.sessions[0];
  return (
    <>
      <button type="button" onClick={() => composer.openNew("first@example.net")}>
        New first
      </button>
      <button type="button" onClick={() => composer.openNew("second@example.net")}>
        New second
      </button>
      <button
        type="button"
        onClick={() =>
          composer.openContext({
            message,
            messages: [message],
            mode: "reply",
            origin: {
              folder: "inbox",
              messageId: message.id,
              threadId: message.threadId
            },
            route: originRoute
          })
        }
      >
        Reply
      </button>
      <button
        type="button"
        onClick={() =>
          composer.openDraft({
            draftId: "draft-reply",
            message,
            messages: [message],
            mode: "reply",
            origin: {
              folder: "inbox",
              messageId: message.id,
              threadId: message.threadId
            },
            route: { kind: "drafts", draftId: "draft-reply" }
          })
        }
      >
        Open reply draft
      </button>
      <button
        type="button"
        onClick={() =>
          composer.openDraft({
            draftId: "draft-reply-two",
            message,
            messages: [message],
            mode: "reply",
            origin: {
              folder: "inbox",
              messageId: message.id,
              threadId: message.threadId
            },
            route: { kind: "drafts", draftId: "draft-reply-two" }
          })
        }
      >
        Open second reply draft
      </button>
      <output data-composer-session-ids={composer.sessions.map((session) => session.id).join(",")}>
        {composer.sessions.map((session) => session.draftId ?? "new").join(",")}
      </output>
      {showInlineTarget && first ? <ComposerInlineTarget sessionId={first.id} /> : null}
    </>
  );
}

function host(
  route: AppRoute,
  navigate: (route: AppRoute) => void,
  showInlineTarget = false
): React.ReactElement {
  return (
    <ComposerHost
      defaultFromMailboxId={null}
      mailboxes={[]}
      navigate={navigate}
      route={route}
      onDraftsChange={() => undefined}
      onManageSignatures={() => undefined}
      onSent={() => undefined}
    >
      {() => <Controls showInlineTarget={showInlineTarget} />}
    </ComposerHost>
  );
}

function click(element: Element | null): void {
  element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("composer host", () => {
  it("keeps separate new-message sessions and records their exact draft IDs", async () => {
    const view = await renderComponent(host(originRoute, vi.fn()));

    await flushHookEffects(() => click(view.container.querySelector("button")));
    await flushHookEffects(() => click(view.container.querySelectorAll("button")[1] ?? null));
    await flushHookEffects();

    const sessions = view.container.querySelector("[data-composer-session-ids]");
    const sessionIds = sessions?.getAttribute("data-composer-session-ids")?.split(",") ?? [];
    expect(sessionIds).toHaveLength(2);
    expect(new Set(sessionIds).size).toBe(2);
    await vi.waitFor(() =>
      expect(view.container.querySelectorAll("[data-compose-mode='new']")).toHaveLength(2)
    );
    expect(
      [...view.container.querySelectorAll("[data-compose-mode='new']")].map((composer) =>
        composer.getAttribute("data-compose-window-slot")
      )
    ).toEqual(["1", "0"]);

    for (const button of view.container.querySelectorAll("[data-compose-action='ready']")) {
      await flushHookEffects(() => click(button));
    }
    expect(sessions?.textContent).toBe("draft-first@example.net,draft-second@example.net");

    await view.unmount();
  });

  it("deduplicates a contextual reply and never unmounts it while its target appears", async () => {
    const navigate = vi.fn();
    const view = await renderComponent(host(originRoute, navigate));
    const reply = view.container.querySelectorAll("button")[2] ?? null;

    await flushHookEffects(() => click(reply));
    await flushHookEffects(() => click(reply));
    await flushHookEffects();

    expect(view.container.querySelectorAll("[data-compose-mode='reply']")).toHaveLength(1);
    const input = view.container.querySelector<HTMLInputElement>("[aria-label='Composer reply']");
    expect(input).not.toBeNull();
    if (input) input.value = "unsaved editor state";

    await view.rerender(host(originRoute, navigate, true));
    await flushHookEffects();

    const composer = view.container.querySelector("[data-compose-mode='reply']");
    expect(composer?.getAttribute("data-compose-presentation")).toBe("thread");
    expect(composer?.getAttribute("data-compose-inline")).toBe("true");
    expect(
      view.container.querySelector<HTMLInputElement>("[aria-label='Composer reply']")?.value
    ).toBe("unsaved editor state");

    await view.rerender(host(settingsRoute, navigate, false));
    await flushHookEffects();
    expect(
      view.container
        .querySelector("[data-compose-mode='reply']")
        ?.getAttribute("data-compose-presentation")
    ).toBe("window");
    expect(
      view.container.querySelector<HTMLInputElement>("[aria-label='Composer reply']")?.value
    ).toBe("unsaved editor state");

    await view.unmount();
  });

  it("adopts an exact draft opened while its contextual composer is still initializing", async () => {
    const view = await renderComponent(host(originRoute, vi.fn()));
    await flushHookEffects(() => click(view.container.querySelectorAll("button")[2] ?? null));
    await flushHookEffects(() => click(view.container.querySelectorAll("button")[3] ?? null));
    await flushHookEffects();

    const composers = view.container.querySelectorAll("[data-compose-mode='reply']");
    expect(composers).toHaveLength(1);
    expect(composers[0]?.getAttribute("data-compose-draft-id")).toBe("draft-reply");
    expect(view.container.querySelector("[data-composer-session-ids]")?.textContent).toBe(
      "draft-reply"
    );

    await view.unmount();
  });

  it("keeps different saved drafts for the same reply target as separate sessions", async () => {
    const view = await renderComponent(host(originRoute, vi.fn()));
    await flushHookEffects(() => click(view.container.querySelectorAll("button")[3] ?? null));
    await flushHookEffects(() => click(view.container.querySelectorAll("button")[4] ?? null));
    await flushHookEffects();

    const composers = view.container.querySelectorAll("[data-compose-mode='reply']");
    expect(composers).toHaveLength(2);
    expect(
      [...composers].map((composer) => composer.getAttribute("data-compose-draft-id"))
    ).toEqual(["draft-reply", "draft-reply-two"]);

    await view.unmount();
  });

  it("detaches and returns to the exact conversation", async () => {
    const navigate = vi.fn();
    const view = await renderComponent(host(originRoute, navigate, true));
    await flushHookEffects(() => click(view.container.querySelectorAll("button")[2] ?? null));
    await flushHookEffects();

    click(view.container.querySelector("[data-compose-action='detach']"));
    await flushHookEffects();
    expect(
      view.container
        .querySelector("[data-compose-mode='reply']")
        ?.getAttribute("data-compose-presentation")
    ).toBe("window");

    await flushHookEffects(() =>
      click(view.container.querySelector("[data-compose-action='return']"))
    );
    expect(navigate).toHaveBeenCalledWith(originRoute);
    expect(
      view.container
        .querySelector("[data-compose-mode='reply']")
        ?.getAttribute("data-compose-presentation")
    ).toBe("thread");

    await view.unmount();
  });

  it("keeps every minimized composer reachable in the shared scrollable dock", async () => {
    const view = await renderComponent(host(originRoute, vi.fn()));
    for (let index = 0; index < 4; index += 1) {
      await flushHookEffects(() => click(view.container.querySelectorAll("button")[0] ?? null));
    }
    await flushHookEffects();

    const minimize = view.container.querySelectorAll("[data-compose-action='minimize']");
    for (const button of minimize) await flushHookEffects(() => click(button));

    const dock = view.container.querySelector("[data-composer-dock]");
    const composers = view.container.querySelectorAll("[data-compose-mode='new']");
    expect(dock?.className).toContain("max-w-[calc(100vw-2rem)]");
    expect(dock?.className).toContain("overflow-x-auto");
    expect(composers).toHaveLength(4);
    for (const [index, composer] of [...composers].entries()) {
      expect(composer.parentElement).toBe(dock);
      expect(composer.getAttribute("data-compose-minimized")).toBe("true");
      expect(composer.getAttribute("data-compose-dock-index")).toBe(String(index));
    }

    await view.unmount();
  });
});
