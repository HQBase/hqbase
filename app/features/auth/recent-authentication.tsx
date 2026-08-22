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
import {
  initialRecentAuthenticationState,
  recentAuthenticationReducer
} from "@/features/auth/recent-authentication-state";
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
  const [state, dispatch] = React.useReducer(
    recentAuthenticationReducer,
    initialRecentAuthenticationState
  );
  const passwordId = React.useId();

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    dispatch({ type: "check-started" });
    void getRecentAuthentication()
      .then((recent) => {
        if (!cancelled) dispatch({ type: "check-finished", recent });
      })
      .catch((nextError: unknown) => {
        if (cancelled) return;
        dispatch({
          type: "check-failed",
          message:
            nextError instanceof Error ? nextError.message : "Your sign-in could not be confirmed."
        });
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  async function confirmPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: "submit-started" });
    try {
      await reauthenticate(state.password);
    } catch (nextError) {
      dispatch({
        type: "authentication-failed",
        message: nextError instanceof Error ? nextError.message : "Sign-in confirmation failed."
      });
      return;
    }

    dispatch({ type: "authenticated" });
    try {
      await onAuthenticated?.();
    } catch {
      dispatch({
        type: "continuation-failed",
        message: "Sign-in was confirmed, but the next action could not start. Try again."
      });
    }
  }

  if (state.authentication === "recent") {
    return (
      <>
        {state.continuationError ? (
          <p className="text-xs text-destructive" role="alert">
            {state.continuationError}
          </p>
        ) : null}
        {ready}
      </>
    );
  }
  if (state.authentication === "checking") {
    return <AuthenticationChecking description={description} layout={layout} />;
  }
  return (
    <ReauthenticationForm
      description={description}
      error={state.authenticationError}
      layout={layout}
      password={state.password}
      passwordId={passwordId}
      pending={state.pending}
      onPasswordChange={(password) => dispatch({ type: "password-changed", password })}
      onSubmit={(event) => void confirmPassword(event)}
    />
  );
}

function ReauthenticationForm({
  description,
  error,
  layout,
  password,
  passwordId,
  pending,
  onPasswordChange,
  onSubmit
}: {
  description: string;
  error: string | null;
  layout: "dialog" | "inline";
  password: string;
  passwordId: string;
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
        <label className="flex flex-col gap-2 text-xs text-muted-foreground" htmlFor={passwordId}>
          Password
          <Input
            aria-label="Password"
            autoComplete="current-password"
            autoFocus
            id={passwordId}
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
