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
import { RecentAuthenticationGate } from "@/features/auth/recent-authentication";
import {
  AmbiguousPersonalAccessTokenCreateError,
  createPersonalAccessToken,
  PersonalAccessTokenApiError
} from "./api";
import { defaultPersonalAccessTokenExpiry, personalAccessTokenExpiryToIso } from "./expiry";
import type { CreatePersonalAccessTokenResponse } from "./types";

export function CreatePersonalAccessTokenDialog({
  open,
  onAmbiguous,
  onCreated,
  onOpenChange
}: {
  open: boolean;
  onAmbiguous: (error: AmbiguousPersonalAccessTokenCreateError) => void | Promise<void>;
  onCreated: (result: CreatePersonalAccessTokenResponse) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,520px)]">
        <RecentAuthenticationGate
          active={open}
          description="Creating a personal access token requires recent authentication."
          layout="dialog"
          ready={
            <CreatePersonalAccessTokenForm
              active={open}
              onAmbiguous={onAmbiguous}
              onCreated={onCreated}
              onOpenChange={onOpenChange}
            />
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function CreatePersonalAccessTokenForm({
  active,
  onAmbiguous,
  onCreated,
  onOpenChange
}: {
  active: boolean;
  onAmbiguous: (error: AmbiguousPersonalAccessTokenCreateError) => void | Promise<void>;
  onCreated: (result: CreatePersonalAccessTokenResponse) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [name, setName] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState(defaultPersonalAccessTokenExpiry);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!active) return;
    setName("");
    setExpiresAt(defaultPersonalAccessTokenExpiry());
    setPending(false);
    setError(null);
  }, [active]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;
    let expiry: string | null;
    try {
      expiry = personalAccessTokenExpiryToIso(expiresAt);
    } catch {
      setError("Expiry is invalid.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await createPersonalAccessToken({ name: trimmedName, expiresAt: expiry });
      onOpenChange(false);
      await onCreated(result);
    } catch (nextError) {
      if (nextError instanceof AmbiguousPersonalAccessTokenCreateError) {
        onOpenChange(false);
        await onAmbiguous(nextError);
        return;
      }
      setError(
        nextError instanceof PersonalAccessTokenApiError
          ? nextError.message
          : "The personal access token could not be created."
      );
      setPending(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create personal access token</DialogTitle>
        <DialogDescription>
          Use a short name that identifies the client or automation.
        </DialogDescription>
      </DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <label className="flex flex-col gap-2 text-xs text-muted-foreground" htmlFor="pat-name">
          Name
          <Input
            aria-label="Name"
            autoComplete="off"
            id="pat-name"
            maxLength={80}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2 text-xs text-muted-foreground" htmlFor="pat-expiry">
          Expires
          <Input
            aria-label="Expires"
            id="pat-expiry"
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </label>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button disabled={pending} type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button disabled={pending || name.trim().length === 0} type="submit">
            {pending ? "Creating…" : "Create personal access token"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
