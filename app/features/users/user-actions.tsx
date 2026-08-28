import * as React from "react";
import {
  PiArrowCounterClockwise,
  PiDotsThree,
  PiEnvelope,
  PiKey,
  PiUserMinus
} from "react-icons/pi";
import { toast } from "sonner";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  getRecentAuthentication,
  reauthenticate
} from "@/features/settings/cloudflare-authorization-api";
import { removeUser, restoreUser } from "./api";
import type { WorkspaceRole, WorkspaceUser } from "./types";

export type UserLifecycleAction = {
  kind: "remove" | "restore";
  user: WorkspaceUser;
};

export function UserActions({
  currentUser,
  disabled,
  user,
  onLifecycleAction,
  onPendingAction
}: {
  currentUser: { id: string; role: WorkspaceRole };
  disabled: boolean;
  user: WorkspaceUser;
  onLifecycleAction: (kind: UserLifecycleAction["kind"]) => void;
  onPendingAction: () => void;
}): React.ReactElement {
  const ownerActionBlocked = user.role === "owner" && currentUser.role !== "owner";
  const removalBlocked = user.id === currentUser.id || ownerActionBlocked;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Actions for ${user.name}`}
          disabled={disabled}
          size="icon"
          type="button"
          variant="ghost"
        >
          {disabled ? <Spinner /> : <PiDotsThree aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!user.banned && user.passwordSetupRequired ? (
          <>
            <DropdownMenuItem className="gap-2" onSelect={onPendingAction}>
              {user.onboardingMethod === "email_invite" ? (
                <PiEnvelope aria-hidden="true" />
              ) : (
                <PiKey aria-hidden="true" />
              )}
              {user.onboardingMethod === "email_invite" ? "Resend invitation" : "New password"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {user.banned ? (
          <DropdownMenuItem
            className="gap-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            disabled={ownerActionBlocked}
            onSelect={() => onLifecycleAction("restore")}
          >
            <PiArrowCounterClockwise aria-hidden="true" />
            Restore user
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="gap-2 text-destructive data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            disabled={removalBlocked}
            onSelect={() => onLifecycleAction("remove")}
          >
            <PiUserMinus aria-hidden="true" />
            Remove user
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserLifecycleDialog({
  action,
  pending,
  onChanged,
  onClose,
  onPendingChange
}: {
  action: UserLifecycleAction | null;
  pending: boolean;
  onChanged: () => void;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}): React.ReactElement {
  const [authentication, setAuthentication] = React.useState<"checking" | "recent" | "stale">(
    "checking"
  );
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!action) return;
    let cancelled = false;
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
  }, [action]);

  async function runAction(passwordToConfirm?: string) {
    if (!action) return;
    onPendingChange(true);
    setError(null);
    try {
      if (passwordToConfirm) await reauthenticate(passwordToConfirm);
      if (action.kind === "remove") await removeUser(action.user.id);
      else await restoreUser(action.user.id);
      toast.success(
        action.kind === "remove"
          ? `${action.user.name} was removed.`
          : `${action.user.name} was restored.`
      );
      onClose();
      onChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The user could not be changed.");
    } finally {
      onPendingChange(false);
    }
  }

  const verb = action?.kind === "restore" ? "restore" : "remove";
  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="w-[min(92vw,520px)]">
        {authentication === "stale" ? (
          <>
            <DialogHeader>
              <DialogTitle>Sign in again</DialogTitle>
              <DialogDescription>
                Confirm your HQBase password before you {verb} {action?.user.name}.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void runAction(password);
              }}
            >
              <label
                className="flex flex-col gap-2 text-xs text-muted-foreground"
                htmlFor="user-lifecycle-password"
              >
                Password
                <Input
                  autoComplete="current-password"
                  autoFocus
                  id="user-lifecycle-password"
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <LifecycleError error={error} />
              <DialogFooter>
                <DialogClose asChild>
                  <Button disabled={pending} type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  disabled={pending}
                  type="submit"
                  variant={verb === "remove" ? "destructive" : "default"}
                >
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  Sign in and {verb}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{verb === "remove" ? "Remove user?" : "Restore user?"}</DialogTitle>
              <DialogDescription>
                {verb === "remove" ? (
                  <>
                    This ends {action?.user.name}&apos;s sessions and connected-app access, stops
                    notifications, and removes mailbox access. Mail and account history stay
                    available.
                  </>
                ) : (
                  <>
                    This enables sign-in for {action?.user.name} again. Previous sessions, connected
                    apps, notifications, and mailbox access do not return.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <LifecycleError error={error} />
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={pending} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                disabled={pending || authentication === "checking"}
                type="button"
                variant={verb === "remove" ? "destructive" : "default"}
                onClick={() => void runAction()}
              >
                {pending || authentication === "checking" ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                {authentication === "checking"
                  ? "Checking sign-in…"
                  : verb === "remove"
                    ? "Remove user"
                    : "Restore user"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LifecycleError({ error }: { error: string | null }): React.ReactElement | null {
  return error ? (
    <p className="text-sm text-destructive" role="alert">
      {error}
    </p>
  ) : null;
}
