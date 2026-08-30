import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const scopeDescriptions: Record<string, string> = {
  "mail:read":
    "Read allowed mailboxes, conversations, message text, threads, and bounded attachments",
  "mail:write": "Change message and conversation state where you have Handle mail access",
  "mail:send":
    "Manage drafts and attachments, then send, reply, or forward where you have Handle mail access",
  offline_access: "Stay connected until you revoke access"
};

export function DeviceAuthorizationReview({
  clientName,
  error,
  identity,
  onAllow,
  onDeny,
  pending,
  resource,
  scopes,
  userCode,
  verified
}: {
  clientName: string;
  error: string | null;
  identity: string;
  onAllow: () => void;
  onDeny: () => void;
  pending: "allow" | "deny" | null;
  resource: string;
  scopes: string[];
  userCode: string;
  verified: boolean;
}): React.ReactElement {
  return (
    <PageFrame>
      <Card className="w-full max-w-md bg-card/70 shadow-none">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg font-medium tracking-tight">Connect {clientName}</CardTitle>
          <CardDescription>
            Check that this code matches the one shown by the agent before allowing access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="space-y-3 rounded-md border px-3 py-3 text-sm">
            <Detail label="Code" value={userCode} valueClassName="font-mono tracking-widest" />
            <Detail label="Signed in as" value={identity} />
            <Detail
              label="Resource"
              value={resource}
              valueClassName="break-all font-mono text-xs"
            />
          </dl>
          {scopes.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium">Requested access</p>
              <ul className="space-y-2 text-sm">
                {scopes.map((scope) => (
                  <li className="rounded-md border px-3 py-2" key={scope}>
                    {scopeDescriptions[scope] ?? scope}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            The client receives an OAuth token, never your password or browser session. You can
            revoke access later, and your live mailbox grants still apply.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              disabled={!verified || pending !== null}
              onClick={onDeny}
              type="button"
              variant="outline"
            >
              {pending === "deny" ? "Denying" : "Deny"}
            </Button>
            <Button disabled={!verified || pending !== null} onClick={onAllow} type="button">
              {pending === "allow" ? "Allowing" : "Allow"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageFrame>
  );
}

export function DeviceCodeEntry({
  error,
  inputCode,
  onInputCodeChange,
  onSubmit
}: {
  error: string | null;
  inputCode: string;
  onInputCodeChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}): React.ReactElement {
  return (
    <PageFrame>
      <Card className="w-full max-w-sm bg-card/70 shadow-none">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg font-medium tracking-tight">Connect a device</CardTitle>
          <CardDescription>Enter the short code shown by your agent or client.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <label
              className="flex flex-col gap-2 text-xs text-muted-foreground"
              htmlFor="device-code"
            >
              Device code
              <Input
                autoCapitalize="characters"
                autoComplete="one-time-code"
                className="bg-background font-mono uppercase tracking-widest shadow-none focus-visible:ring-1"
                id="device-code"
                maxLength={12}
                onChange={(event) => onInputCodeChange(event.target.value)}
                required
                spellCheck={false}
                value={inputCode}
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end">
              <Button type="submit">Continue</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageFrame>
  );
}

export function DeviceAuthorizationResult({ approved }: { approved: boolean }): React.ReactElement {
  return (
    <PageFrame>
      <Card className="w-full max-w-sm bg-card/70 shadow-none">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg font-medium tracking-tight">
            {approved ? "Access allowed" : "Access denied"}
          </CardTitle>
          <CardDescription>
            {approved
              ? "Return to the agent or client. It will continue automatically, and you can close this page."
              : "The agent or client was not connected. You can close this page."}
          </CardDescription>
        </CardHeader>
      </Card>
    </PageFrame>
  );
}

export function DeviceAuthorizationFailure({
  error,
  onRetry
}: {
  error: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <PageFrame>
      <Card className="w-full max-w-sm bg-card/70 shadow-none">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg font-medium tracking-tight">Code unavailable</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end">
          <Button onClick={onRetry} type="button" variant="outline">
            Enter another code
          </Button>
        </CardContent>
      </Card>
    </PageFrame>
  );
}

export function FullScreenStatus({ label }: { label: string }): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {label}
    </main>
  );
}

function PageFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center justify-center gap-2">
        <img alt="" className="h-7 w-auto" src="/logo.svg" />
        <span className="text-sm font-medium">HQBase</span>
      </div>
      {children}
    </main>
  );
}

function Detail({
  label,
  value,
  valueClassName = ""
}: {
  label: string;
  value: string;
  valueClassName?: string;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={valueClassName}>{value}</dd>
    </div>
  );
}
