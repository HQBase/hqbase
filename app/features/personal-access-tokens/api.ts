import type { PersonalAccessTokenList } from "./types";

export async function listPersonalAccessTokens(): Promise<PersonalAccessTokenList> {
  const response = await fetch("/api/personal-access-tokens", {
    cache: "no-store",
    credentials: "include",
    method: "GET"
  });
  if (!response.ok) throw new Error("Personal access tokens could not be loaded.");
  return response.json<PersonalAccessTokenList>();
}

export async function revokePersonalAccessToken(id: string): Promise<void> {
  const response = await fetch(`/api/personal-access-tokens/${encodeURIComponent(id)}`, {
    cache: "no-store",
    credentials: "include",
    method: "DELETE"
  });
  if (response.status !== 204) throw new Error("The personal access token could not be revoked.");
}
