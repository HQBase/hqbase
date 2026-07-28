import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getRecentAuthentication, reauthenticate } from "./cloudflare-authorization-api";

export function CloudflareAuthorizationDialog({
  authorizeHref,
  description,
  onAuthorize,
  onOpenChange,
  open
}: {
  authorizeHref: string;
  description: string;
  onAuthorize?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,520px)]">
        <CloudflareAuthorizationFlow
          active={open}
          authorizeHref={authorizeHref}
          description={description}
          layout="dialog"
          {...(onAuthorize ? { onAuthorize } : {})}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CloudflareAuthorizationFlow({
  active,
  authorizeHref,
  description,
  layout,
  onAuthorize
}: {
  active: boolean;
  authorizeHref: string;
  description: string;
  layout: "dialog" | "inline";
  onAuthorize?: () => void;
}): React.ReactElement {
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
      onAuthorize?.();
      window.location.assign(authorizeHref);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Sign-in confirmation failed.");
      setPending(false);
    }
  }

  if (authentication === "recent") {
    return layout === "dialog" ? (
      <CloudflareAuthorizationDialogBody
        authorizeHref={authorizeHref}
        description={description}
        {...(onAuthorize ? { onAuthorize } : {})}
      />
    ) : (
      <InlineAuthorization
        authorizeHref={authorizeHref}
        description={description}
        {...(onAuthorize ? { onAuthorize } : {})}
      />
    );
  }

  if (authentication === "checking") {
    return <AuthorizationChecking description={description} layout={layout} />;
  }

  return (
    <CloudflareReauthenticationForm
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

export function CloudflareAuthorizationDialogBody({
  authorizeHref,
  description,
  onAuthorize
}: {
  authorizeHref: string;
  description: string;
  onAuthorize?: () => void;
}): React.ReactElement {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Authorize Cloudflare</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button asChild>
          <a href={authorizeHref} onClick={onAuthorize}>
            Authorize Cloudflare
          </a>
        </Button>
      </DialogFooter>
    </>
  );
}

export function CloudflareReauthenticationForm({
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
  return (
    <>
      {layout === "dialog" ? (
        <DialogHeader>
          <DialogTitle>Sign in again</DialogTitle>
          <DialogDescription>
            Confirm your HQBase password before authorizing Cloudflare. {description}
          </DialogDescription>
        </DialogHeader>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          Confirm your HQBase password before authorizing Cloudflare.
        </p>
      )}
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label
          className="flex flex-col gap-2 text-xs text-muted-foreground"
          htmlFor="cloudflare-reauthentication-password"
        >
          Password
          <Input
            aria-label="Password"
            autoComplete="current-password"
            autoFocus
            id="cloudflare-reauthentication-password"
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
            <Button disabled={pending} type="submit">
              {pending ? "Signing in…" : "Sign in and continue"}
            </Button>
          </DialogFooter>
        ) : (
          <Button className="self-start" disabled={pending} type="submit">
            {pending ? "Signing in…" : "Sign in and continue"}
          </Button>
        )}
      </form>
    </>
  );
}

function AuthorizationChecking({
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
        <DialogTitle>Authorize Cloudflare</DialogTitle>
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

function InlineAuthorization({
  authorizeHref,
  description,
  onAuthorize
}: {
  authorizeHref: string;
  description: string;
  onAuthorize?: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      <Button asChild className="self-start">
        <a href={authorizeHref} onClick={onAuthorize}>
          Authorize Cloudflare
        </a>
      </Button>
    </div>
  );
}
