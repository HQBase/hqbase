import { apiGet } from "@/lib/api-client";
import type { CurrentUser } from "./types";

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>("/api/me");
}

export async function signIn(email: string, password: string): Promise<void> {
  const response = await fetch("/api/auth/sign-in/email", {
    body: JSON.stringify({ email, password, rememberMe: true }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  if (!response.ok) {
    throw new Error("Email or password is incorrect.");
  }
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/sign-out", {
    body: JSON.stringify({}),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}
