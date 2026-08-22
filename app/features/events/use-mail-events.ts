import * as React from "react";

const reconnectBaseDelayMs = 1_000;
const reconnectMaxDelayMs = 30_000;

type MailEventTopic = "drafts" | "mailboxes" | "messages";

type MailEventHandlers = {
  onDrafts: () => unknown;
  onMailboxes: () => unknown;
  onMessages: () => unknown;
  onReconnect: () => unknown;
};

type MailEvent = {
  topic: MailEventTopic;
  type: "changed";
};

export function useMailEvents(userId: string | null, handlers: MailEventHandlers): void {
  const currentHandlers = React.useRef(handlers);

  React.useLayoutEffect(() => {
    currentHandlers.current = handlers;
  }, [handlers]);

  React.useEffect(() => {
    if (!userId) return;

    let active = true;
    let attempt = 0;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;
    const pendingTopics = new Set<MailEventTopic>();
    let flushScheduled = false;

    const invoke = (callback: () => unknown): void => {
      void Promise.resolve()
        .then(callback)
        .catch(() => undefined);
    };
    const flush = (): void => {
      flushScheduled = false;
      if (!active) return;
      for (const topic of pendingTopics) {
        const callback =
          topic === "messages"
            ? currentHandlers.current.onMessages
            : topic === "drafts"
              ? currentHandlers.current.onDrafts
              : currentHandlers.current.onMailboxes;
        invoke(callback);
      }
      pendingTopics.clear();
    };
    const queueTopic = (topic: MailEventTopic): void => {
      pendingTopics.add(topic);
      if (flushScheduled) return;
      flushScheduled = true;
      queueMicrotask(flush);
    };
    const canConnect = (): boolean =>
      active && document.visibilityState === "visible" && navigator.onLine !== false;
    const closeSocket = (): void => {
      const current = socket;
      socket = null;
      if (current && current.readyState < WebSocket.CLOSING) {
        current.close(1000, "Connection paused.");
      }
    };

    const connect = (): void => {
      if (!canConnect() || socket !== null) return;

      const url = new URL("/api/v1/events", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const next = new WebSocket(url);
      socket = next;
      next.addEventListener("open", () => {
        if (!active || socket !== next) return;
        attempt = 0;
        invoke(currentHandlers.current.onReconnect);
      });
      next.addEventListener("message", (event) => {
        const parsed = parseMailEvent(event.data);
        if (parsed) queueTopic(parsed.topic);
      });
      next.addEventListener("error", () => {
        if (socket === next && next.readyState < WebSocket.CLOSING) next.close();
      });
      next.addEventListener("close", () => {
        if (socket !== next) return;
        socket = null;
        if (!canConnect() || reconnectTimer !== null) return;
        const delay = Math.min(
          reconnectMaxDelayMs,
          reconnectBaseDelayMs * 2 ** Math.min(attempt, 5)
        );
        attempt += 1;
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, delay + reconnectJitterMs());
      });
    };
    const resume = (): void => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      connect();
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") resume();
      else closeSocket();
    };
    const handleOnline = (): void => resume();
    const handleOffline = (): void => closeSocket();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    connect();
    return () => {
      active = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      closeSocket();
    };
  }, [userId]);
}

function parseMailEvent(value: unknown): MailEvent | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<MailEvent>;
    if (
      candidate.type !== "changed" ||
      !["drafts", "mailboxes", "messages"].includes(candidate.topic ?? "")
    ) {
      return null;
    }
    return candidate as MailEvent;
  } catch {
    return null;
  }
}

function reconnectJitterMs(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return (values[0] ?? 0) % 500;
}
