import * as React from "react";
import { flushSync } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { signOutStartedEvent } from "@/features/auth/sign-out-lifecycle";
import { SettingsSection } from "@/features/settings/settings-section";
import type { WorkspaceRole } from "@/features/users/types";
import { listPersonalAccessTokens, revokePersonalAccessToken } from "./api";
import { CreatePersonalAccessTokenDialog } from "./create-personal-access-token-dialog";
import { OneTimeTokenDialog } from "./one-time-token-dialog";
import { PersonalAccessTokenTable } from "./personal-access-token-table";
import type { PersonalAccessTokenMetadata } from "./types";

export function PersonalAccessTokenSettings({
  userRole,
  onCopyReferenceChange
}: {
  userRole: WorkspaceRole;
  onCopyReferenceChange?: (hasValue: boolean) => void;
}): React.ReactElement {
  const [personalAccessTokens, setPersonalAccessTokens] = React.useState<
    PersonalAccessTokenMetadata[]
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<PersonalAccessTokenMetadata | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [oneTimeToken, setOneTimeToken] = React.useState<string | null>(null);
  const [oneTimeOpen, setOneTimeOpen] = React.useState(false);
  const copyReference = React.useRef<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await listPersonalAccessTokens();
      setPersonalAccessTokens(result.personalAccessTokens);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Personal access tokens failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const clearPlaintext = React.useCallback(() => {
    copyReference.current = null;
    onCopyReferenceChange?.(false);
    setOneTimeToken(null);
    setOneTimeOpen(false);
  }, [onCopyReferenceChange]);

  React.useEffect(() => {
    const clearSynchronously = () => {
      copyReference.current = null;
      onCopyReferenceChange?.(false);
      flushSync(() => {
        setOneTimeToken(null);
        setOneTimeOpen(false);
      });
    };
    window.addEventListener("pagehide", clearSynchronously);
    window.addEventListener(signOutStartedEvent, clearSynchronously);
    return () => {
      window.removeEventListener("pagehide", clearSynchronously);
      window.removeEventListener(signOutStartedEvent, clearSynchronously);
      copyReference.current = null;
      onCopyReferenceChange?.(false);
    };
  }, [onCopyReferenceChange]);

  async function revoke(): Promise<void> {
    if (!revokeTarget || pendingId !== null) return;
    setPendingId(revokeTarget.id);
    setError(null);
    try {
      await revokePersonalAccessToken(revokeTarget.id);
      setRevokeTarget(null);
      await refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Personal access token revocation failed."
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <SettingsSection
      action={
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Create token
        </Button>
      }
      description="Manage credentials for Mail API automation."
      title="API"
    >
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Personal access tokens can call every Mail API operation, subject to the token owner's
          current role and mailbox grants.
        </p>
        <p>Personal access tokens cannot access workspace administration or MCP.</p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {loading && personalAccessTokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading personal access tokens…</p>
      ) : (
        <PersonalAccessTokenTable
          pendingId={pendingId}
          personalAccessTokens={personalAccessTokens}
          userRole={userRole}
          onRevoke={setRevokeTarget}
        />
      )}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open && pendingId === null) setRevokeTarget(null);
        }}
      >
        <DialogContent className="w-[min(92vw,480px)]">
          <DialogHeader>
            <DialogTitle>Revoke {revokeTarget?.name}?</DialogTitle>
            <DialogDescription>
              Active clients will fail on their next request. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={pendingId !== null} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={pendingId !== null} type="button" onClick={() => void revoke()}>
              {pendingId !== null ? "Revoking…" : "Revoke token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreatePersonalAccessTokenDialog
        open={createOpen}
        onAmbiguous={async (nextError) => {
          await refresh();
          setError(nextError.message);
        }}
        onCreated={(result) => {
          copyReference.current = result.token;
          onCopyReferenceChange?.(true);
          setOneTimeToken(result.token);
          setOneTimeOpen(true);
          void refresh();
        }}
        onOpenChange={setCreateOpen}
      />
      <OneTimeTokenDialog
        open={oneTimeOpen}
        token={oneTimeToken}
        onCopy={async () => {
          const token = copyReference.current;
          if (!token || !navigator.clipboard) return false;
          try {
            await navigator.clipboard.writeText(token);
            return true;
          } catch {
            return false;
          }
        }}
        onOpenChange={(open) => {
          if (!open) clearPlaintext();
        }}
      />
    </SettingsSection>
  );
}
