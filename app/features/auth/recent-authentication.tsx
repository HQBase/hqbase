import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getRecentAuthentication, reauthenticate } from "./recent-authentication-api";

export type RecentAuthenticationGateProps = {
  active: boolean;
  description: string;
  layout: "dialog" | "inline";
  ready: React.ReactNode;
  onAuthenticated?: () => void | Promise<void>;
};

export function RecentAuthenticationGate({
  active,
  description,
  layout,
  ready,
  onAuthenticated
}: RecentAuthenticationGateProps): React.ReactElement {
  const [authentication, setAuthentication] = React.useState<"checking" | "recent" | "stale">(
    "checking"
  );
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setAuthentication("checking");
    setPassword("");
    setError(null);
    setPending(false);
    void getRecentAuthentication()
      .then((recent) => {
        if (!cancelled) setAuthentication(recent ? "recent" : "stale");
      })
      .catch((nextError: unknown) => {
        if (cancelled) return;
        setAuthentication("stale");
        setError(
          nextError instanceof Error ? nextError.message : "Your sign-in could not be confirmed."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  async function confirmPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await reauthenticate(password);
      setAuthentication("recent");
      await onAuthenticated?.();
    } catch (nextError) {
      setAuthentication("stale");
      setError(nextError instanceof Error ? nextError.message : "Sign-in confirmation failed.");
      setPending(false);
    }
  }

  if (authentication === "recent") return <>{ready}</>;
  if (authentication === "checking") {
    return <AuthenticationChecking description={description} layout={layout} />;
  }
  return (
    <ReauthenticationForm
      description={description}
      error={error}
      layout={layout}
      password={password}
      pending={pending}
      onPasswordChange={setPassword}
      onSubmit={(event) => void confirmPassword(event)}
    />
  );
}

function ReauthenticationForm({
  description,
  error,
  layout,
  password,
  pending,
  onPasswordChange,
  onSubmit
}: {
  description: string;
  error: string | null;
  layout: "dialog" | "inline";
  password: string;
  pending: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}): React.ReactElement {
  const guidance = "Confirm your HQBase password to continue.";
  return (
    <>
      {layout === "dialog" ? (
        <DialogHeader>
          <DialogTitle>Sign in again</DialogTitle>
          <DialogDescription>
            {guidance} {description}
          </DialogDescription>
        </DialogHeader>
      ) : (
        <div className="flex flex-col gap-2 text-sm leading-6 text-muted-foreground">
          <p>{guidance}</p>
          <p>{description}</p>
        </div>
      )}
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label
          className="flex flex-col gap-2 text-xs text-muted-foreground"
          htmlFor="recent-authentication-password"
        >
          Password
          <Input
            aria-label="Password"
            autoComplete="current-password"
            autoFocus
            id="recent-authentication-password"
            required
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
        </label>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {layout === "dialog" ? (
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton pending={pending} />
          </DialogFooter>
        ) : (
          <SubmitButton className="self-start" pending={pending} />
        )}
      </form>
    </>
  );
}

function SubmitButton({
  className,
  pending
}: {
  className?: string;
  pending: boolean;
}): React.ReactElement {
  return (
    <Button {...(className ? { className } : {})} disabled={pending} type="submit">
      {pending ? "Signing in…" : "Sign in and continue"}
    </Button>
  );
}

function AuthenticationChecking({
  description,
  layout
}: {
  description: string;
  layout: "dialog" | "inline";
}): React.ReactElement {
  if (layout === "inline") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        <Button className="self-start" disabled type="button">
          Checking sign-in…
        </Button>
      </div>
    );
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirm sign-in</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button disabled type="button">
          Checking sign-in…
        </Button>
      </DialogFooter>
    </>
  );
}
