import { apiGet } from "@/lib/api-client";
import type { CurrentUser } from "./types";

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>("/api/me");
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
  await fetch("/api/auth/sign-out", {
    body: JSON.stringify({}),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}
