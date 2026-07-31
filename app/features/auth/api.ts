import { disableCurrentDeviceNotificationsBeforeSignOut } from "@/features/notifications/sign-out";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type { CurrentUser } from "./types";

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>("/api/me");
}

export async function updateDefaultFromMailbox(defaultFromMailboxId: string): Promise<CurrentUser> {
  return apiPatch<CurrentUser>("/api/me", { defaultFromMailboxId });
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const oauthQuery = window.location.search.slice(1);
  const response = await fetch("/api/auth/sign-in/email", {
    body: JSON.stringify({
      email,
      password,
      rememberMe: true,
      ...(oauthQuery.includes("client_id=") ? { oauth_query: oauthQuery } : {})
    }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  if (!response.ok) {
    throw new Error("Email or password is incorrect.");
  }
  const payload = await response
    .clone()
    .json<{ url?: unknown }>()
    .catch(() => null);
  if (typeof payload?.url === "string") return payload.url;
  return response.redirected && response.url !== window.location.href ? response.url : null;
}

export async function signOut(): Promise<void> {
  await disableCurrentDeviceNotificationsBeforeSignOut().catch(() => {
    // Signing out remains available if browser notification cleanup is unavailable.
  });
  await fetch("/api/auth/sign-out", {
    body: JSON.stringify({}),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

export async function completeTemporaryPasswordSetup(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  await apiPost("/api/me/password", input);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const response = await fetch("/api/auth/reset-password", {
    body: JSON.stringify({ newPassword, token }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(
      response.status === 400
        ? "This password setup link is invalid or expired."
        : "Password setup failed."
    );
  }
}
