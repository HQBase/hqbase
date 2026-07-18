import * as React from "react";
import { signOut } from "@/features/auth/api";
import { ApiRequestError } from "@/lib/api-client";
import {
  advanceProUpgrade,
  completeProUpgrade,
  getProUpgradeStatus,
  startProUpgradeOAuth
} from "./api";
import type { UpgradeState, UpgradeStatus } from "./types";
import {
  activeProgress,
  UpgradeAttentionView,
  UpgradeAuthorizeView,
  UpgradeProgressView
} from "./upgrade-progress-view";

const promotionHandoffRetryLimit = 30;
const promotionHandoffRetryDelayMs = 1_000;

export function UpgradeExperience(): React.ReactElement | null {
  const result = new URLSearchParams(window.location.search).get("upgrade");
  const [status, setStatus] = React.useState<UpgradeStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (result !== "progress") return;
    void getProUpgradeStatus()
      .then(setStatus)
      .catch((reason) => captureError(reason, setError, setErrorCode));
  }, [result]);

  React.useEffect(() => {
    if (!status || busy || error || terminal(status.state)) return;
    if (shouldCompleteWithProRuntime(status.state)) return;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError(null);
      setErrorCode(null);
      void advanceProUpgrade()
        .then(setStatus)
        .catch(async (reason) => {
          captureError(reason, setError, setErrorCode);
          await getProUpgradeStatus()
            .then(setStatus)
            .catch(() => undefined);
        })
        .finally(() => setBusy(false));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [busy, error, status]);

  React.useEffect(() => {
    if (status?.state !== "promoted" || error) return;
    let cancelled = false;
    void completePromotedUpgrade(completeProUpgrade, delay, () => cancelled)
      .then((completed) => {
        if (completed && !cancelled) {
          window.location.replace(proCompletionUrl());
        }
      })
      .catch((reason) => {
        if (!cancelled) captureError(reason, setError, setErrorCode);
      });
    return () => {
      cancelled = true;
    };
  }, [error, status?.state]);

  if (!result) return null;
  if (result === "authorize") {
    return (
      <UpgradeAuthorizeView
        busy={busy}
        error={error}
        onAuthorize={() => void beginCloudflareAuthorization(setBusy, setError, setErrorCode)}
      />
    );
  }
  if (result !== "progress") {
    return <UpgradeAttentionView onReturn={() => window.location.assign("/")} />;
  }
  const active = activeProgress(status);
  return (
    <UpgradeProgressView
      active={active}
      busy={busy}
      error={error}
      needsSignIn={requiresUpgradeSignIn(errorCode)}
      status={status}
      onAuthorize={() => void beginCloudflareAuthorization(setBusy, setError, setErrorCode)}
      onRetry={() => retryUpgradeStep(setError, setErrorCode, setStatus)}
      onSignIn={() => {
        setBusy(true);
        void signOut().finally(() => window.location.reload());
      }}
    />
  );
}

export function requiresUpgradeSignIn(errorCode: string | null): boolean {
  return errorCode === "UNAUTHENTICATED" || errorCode === "RECENT_AUTH_REQUIRED";
}

export function shouldCompleteWithProRuntime(state: UpgradeState): boolean {
  return state === "promoted";
}

export function isPromotionHandoffPending(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "UPGRADE_RUNTIME_HANDOFF_PENDING";
}

export function proCompletionUrl(now = Date.now()): string {
  return `/settings?upgrade=complete&cutover=${now}`;
}

export async function completePromotedUpgrade(
  request: () => Promise<unknown>,
  wait: (milliseconds: number) => Promise<void>,
  cancelled: () => boolean = () => false,
  retryLimit = promotionHandoffRetryLimit
): Promise<boolean> {
  for (let attempt = 0; attempt < retryLimit; attempt += 1) {
    if (cancelled()) return false;
    try {
      await request();
      return !cancelled();
    } catch (error) {
      if (!isPromotionHandoffPending(error)) throw error;
      if (attempt === retryLimit - 1) {
        throw new ApiRequestError(
          "UPGRADE_RUNTIME_HANDOFF_TIMEOUT",
          "HQBase Pro is active, but this browser has not switched to it yet. Retry the final handoff."
        );
      }
    }
    await wait(promotionHandoffRetryDelayMs);
  }
  return false;
}

export function retryUpgradeStep(
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  setErrorCode: React.Dispatch<React.SetStateAction<string | null>>,
  setStatus: React.Dispatch<React.SetStateAction<UpgradeStatus | null>>
): void {
  setError(null);
  setErrorCode(null);
  setStatus((current) => (current ? { ...current } : current));
}

function terminal(state: UpgradeState): boolean {
  return ["complete", "failed", "recovery_required"].includes(state);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "This upgrade step could not continue.";
}

function captureError(
  error: unknown,
  setError: (error: string | null) => void,
  setErrorCode: (code: string | null) => void
): void {
  setError(message(error));
  setErrorCode(error instanceof ApiRequestError ? error.code : null);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function beginCloudflareAuthorization(
  setBusy: (busy: boolean) => void,
  setError: (error: string | null) => void,
  setErrorCode: (code: string | null) => void
): Promise<void> {
  setBusy(true);
  setError(null);
  setErrorCode(null);
  try {
    const authorization = await startProUpgradeOAuth();
    window.location.assign(authorization.authorizeUrl);
  } catch (error) {
    captureError(error, setError, setErrorCode);
    setBusy(false);
  }
}
