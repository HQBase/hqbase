import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type OAuthClient = {
  client_id?: string;
  client_name?: string;
  name?: string;
  uri?: string;
};

const scopeDescriptions: Record<string, string> = {
  "mail:read": "Read shared mailboxes and message text",
  "mail:write": "Change read, starred, archived, and trash state",
  "mail:send": "Send email and replies from shared mailboxes",
  offline_access: "Stay connected until you revoke access"
};

export function McpConsentPage(): React.ReactElement {
  const params = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const clientId = params.get("client_id") ?? "";
  const requestedScopes = (params.get("scope") ?? "")
    .split(" ")
    .map((scope) => scope.trim())
    .filter((scope) => scope in scopeDescriptions);
  const [client, setClient] = React.useState<OAuthClient | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<"allow" | "deny" | null>(null);

  React.useEffect(() => {
    if (!clientId) {
      setError("This authorization request is missing a client ID.");
      return;
    }
    void fetch(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`, {
      credentials: "include"
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The MCP client could not be verified.");
        setClient((await response.json()) as OAuthClient);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Authorization failed."));
  }, [clientId]);

  async function decide(accept: boolean): Promise<void> {
    setPending(accept ? "allow" : "deny");
    setError(null);
    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        body: JSON.stringify({
          accept,
          oauth_query: window.location.search.slice(1),
          scope: requestedScopes.join(" ")
        }),
        credentials: "include",
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const payload = await response
        .clone()
        .json<{ url?: unknown }>()
        .catch(() => null);
      if (!response.ok) throw new Error("Authorization could not be completed.");
      const redirectUrl = typeof payload?.url === "string" ? payload.url : response.url;
      window.location.assign(redirectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authorization failed.");
      setPending(null);
    }
  }

  const clientName = client?.client_name ?? client?.name ?? "MCP client";
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md bg-card/70 shadow-none">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg font-medium tracking-tight">Connect {clientName}</CardTitle>
          <CardDescription>
            Review what this client can do in your HQBase Community workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {requestedScopes.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {requestedScopes.map((scope) => (
                <li className="rounded-md border px-3 py-2" key={scope}>
                  {scopeDescriptions[scope]}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Access uses your current account and can be revoked. The client never receives your
            password or Cloudflare credentials.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              disabled={pending !== null}
              onClick={() => void decide(false)}
              type="button"
              variant="outline"
            >
              {pending === "deny" ? "Denying" : "Deny"}
            </Button>
            <Button
              disabled={!client || pending !== null}
              onClick={() => void decide(true)}
              type="button"
            >
              {pending === "allow" ? "Connecting" : "Allow access"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
