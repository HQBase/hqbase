import * as React from "react";

import type { MailConnectionStatus } from "./types";

const reconnectBaseDelayMs = 1_000;
const reconnectMaxDelayMs = 30_000;
const connectionTimeoutMs = 10_000;
const fallbackPollBaseDelayMs = 30_000;
const fallbackPollMaxDelayMs = 60_000;
const heartbeatIntervalMs = 30_000;
const heartbeatTimeoutMs = 10_000;

type MailEventTopic = "drafts" | "mailboxes" | "messages";

type MailEventHandlers = {
  onDrafts: () => unknown;
  onFallbackPoll: () => unknown;
  onMailboxes: () => unknown;
  onMessages: () => unknown;
  onReconnect: () => unknown;
};

type MailEvent = {
  topic: MailEventTopic;
  type: "changed";
};

export function useMailEvents(
  userId: string | null,
  handlers: MailEventHandlers
): MailConnectionStatus {
  const currentHandlers = React.useRef(handlers);
  const [status, setStatus] = React.useState<MailConnectionStatus>("connecting");

  React.useLayoutEffect(() => {
    currentHandlers.current = handlers;
  }, [handlers]);

  React.useEffect(() => {
    if (!userId) return;

    let active = true;
    let attempt = 0;
    let connectionTimer: number | null = null;
    let fallbackAttempt = 0;
    let fallbackInFlight = false;
    let fallbackTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let heartbeatTimeoutTimer: number | null = null;
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
    const socketIsOpen = (): boolean => socket?.readyState === WebSocket.OPEN;
    const clearConnectionTimer = (): void => {
      if (connectionTimer === null) return;
      window.clearTimeout(connectionTimer);
      connectionTimer = null;
    };
    const clearFallbackTimer = (): void => {
      if (fallbackTimer === null) return;
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    };
    const clearHeartbeatTimers = (): void => {
      if (heartbeatTimer !== null) window.clearTimeout(heartbeatTimer);
      if (heartbeatTimeoutTimer !== null) window.clearTimeout(heartbeatTimeoutTimer);
      heartbeatTimer = null;
      heartbeatTimeoutTimer = null;
    };
    const closeSocket = (): void => {
      clearConnectionTimer();
      clearHeartbeatTimers();
      const current = socket;
      socket = null;
      if (current && current.readyState < WebSocket.CLOSING) {
        current.close(1000, "Connection paused.");
      }
    };

    const scheduleHeartbeat = (current: WebSocket): void => {
      clearHeartbeatTimers();
      heartbeatTimer = window.setTimeout(() => {
        heartbeatTimer = null;
        if (!active || socket !== current || current.readyState !== WebSocket.OPEN) return;
        try {
          current.send("ping");
        } catch {
          current.close();
          return;
        }
        heartbeatTimeoutTimer = window.setTimeout(() => {
          heartbeatTimeoutTimer = null;
          if (active && socket === current && current.readyState === WebSocket.OPEN) {
            current.close(4000, "Heartbeat timed out.");
          }
        }, heartbeatTimeoutMs);
      }, heartbeatIntervalMs);
    };

    const scheduleFallbackPoll = (): void => {
      if (!canConnect() || socketIsOpen() || fallbackTimer !== null || fallbackInFlight) return;
      const delay = Math.min(
        fallbackPollMaxDelayMs,
        fallbackPollBaseDelayMs * 2 ** Math.min(fallbackAttempt, 1)
      );
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null;
        runFallbackPoll();
      }, delay);
    };

    const runFallbackPoll = (): void => {
      if (!canConnect() || socketIsOpen() || fallbackTimer !== null || fallbackInFlight) return;
      fallbackInFlight = true;
      setStatus("fallback");
      void Promise.resolve()
        .then(currentHandlers.current.onFallbackPoll)
        .then(
          () => {
            if (!active || socketIsOpen()) return;
            fallbackAttempt = 0;
            setStatus("fallback");
          },
          () => {
            if (!active || socketIsOpen()) return;
            fallbackAttempt += 1;
            setStatus("unavailable");
          }
        )
        .finally(() => {
          fallbackInFlight = false;
          scheduleFallbackPoll();
        });
    };

    const scheduleReconnect = (): void => {
      if (!canConnect() || socket !== null || reconnectTimer !== null) return;
      const delay = Math.min(reconnectMaxDelayMs, reconnectBaseDelayMs * 2 ** Math.min(attempt, 5));
      attempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay + reconnectJitterMs());
    };

    const connect = (): void => {
      if (!canConnect() || socket !== null) return;

      const url = new URL("/api/v1/events", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const next = new WebSocket(url);
      socket = next;
      connectionTimer = window.setTimeout(() => {
        connectionTimer = null;
        if (!active || socket !== next || next.readyState !== WebSocket.CONNECTING) return;
        socket = null;
        next.close();
        runFallbackPoll();
        scheduleReconnect();
      }, connectionTimeoutMs);
      next.addEventListener("open", () => {
        if (!active || socket !== next) return;
        clearConnectionTimer();
        clearFallbackTimer();
        attempt = 0;
        fallbackAttempt = 0;
        setStatus("connected");
        scheduleHeartbeat(next);
        invoke(currentHandlers.current.onReconnect);
      });
      next.addEventListener("message", (event) => {
        if (event.data === "pong") {
          if (heartbeatTimeoutTimer !== null) window.clearTimeout(heartbeatTimeoutTimer);
          heartbeatTimeoutTimer = null;
          if (socket === next) {
            setStatus("connected");
            scheduleHeartbeat(next);
          }
          return;
        }
        const parsed = parseMailEvent(event.data);
        if (parsed) queueTopic(parsed.topic);
      });
      next.addEventListener("error", () => {
        if (socket === next && next.readyState < WebSocket.CLOSING) next.close();
      });
      next.addEventListener("close", () => {
        if (socket !== next) return;
        socket = null;
        clearConnectionTimer();
        clearHeartbeatTimers();
        if (!canConnect()) {
          if (navigator.onLine === false) setStatus("unavailable");
          return;
        }
        runFallbackPoll();
        scheduleReconnect();
      });
    };
    const resume = (): void => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      setStatus("connecting");
      connect();
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") resume();
      else closeSocket();
    };
    const handleOnline = (): void => resume();
    const handleOffline = (): void => {
      clearFallbackTimer();
      closeSocket();
      setStatus("unavailable");
    };

    setStatus("connecting");
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    connect();
    return () => {
      active = false;
      clearFallbackTimer();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      closeSocket();
    };
  }, [userId]);

  return status;
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
