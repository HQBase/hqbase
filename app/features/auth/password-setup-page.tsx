import { CheckCircle2, KeyRound } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { completeTemporaryPasswordSetup, resetPassword, signOut } from "./api";
import type { CurrentUser } from "./types";

export function InvitationPasswordSetupPage({
  token,
  error
}: {
  token: string | null;
  error: string | null;
}): React.ReactElement {
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [complete, setComplete] = React.useState(false);
  const invalid = !token || error === "INVALID_TOKEN";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!token) return;
    setPending(true);
    try {
      await resetPassword(token, newPassword);
      window.history.replaceState({}, "", "/set-password");
      setComplete(true);
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Password setup failed.");
    } finally {
      setPending(false);
    }
  }

  if (complete) {
    return (
      <PasswordShell
        description="Your password is ready. Sign in with your Login email to enter the workspace."
        title="Invitation accepted"
      >
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Password created</AlertTitle>
          <AlertDescription>Your workspace identity is now active.</AlertDescription>
        </Alert>
        <Button onClick={() => window.location.assign("/")} type="button">
          Continue to sign in
        </Button>
      </PasswordShell>
    );
  }

  return (
    <PasswordShell
      description="Choose the password you’ll use with your Login email."
      title="Set up your password"
    >
      {invalid ? (
        <>
          <Alert variant="destructive">
            <KeyRound />
            <AlertTitle>Invitation link unavailable</AlertTitle>
            <AlertDescription>
              This link is invalid, expired, or has already been used. Ask a workspace administrator
              to resend the invitation.
            </AlertDescription>
          </Alert>
          <Button onClick={() => window.location.assign("/")} type="button" variant="outline">
            Return to sign in
          </Button>
        </>
      ) : (
        <PasswordForm
          confirmPassword={confirmPassword}
          newPassword={newPassword}
          pending={pending}
          submitLabel="Create password"
          onConfirmPasswordChange={setConfirmPassword}
          onNewPasswordChange={setNewPassword}
          onSubmit={handleSubmit}
        />
      )}
    </PasswordShell>
  );
}

export function TemporaryPasswordSetupPage({
  user,
  onComplete,
  onSignedOut
}: {
  user: CurrentUser;
  onComplete: () => void;
  onSignedOut: () => void;
}): React.ReactElement {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      await completeTemporaryPasswordSetup({
        confirmPassword,
        currentPassword,
        newPassword
      });
      toast.success("Password updated.");
      onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password setup failed.");
    } finally {
      setPending(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    onSignedOut();
  }

  return (
    <PasswordShell
      description={`Signed in as ${user.email}. Replace the temporary password before entering the workspace.`}
      title="Create your password"
      footer={
        <Button onClick={() => void handleSignOut()} type="button" variant="ghost">
          Sign out
        </Button>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={(event) => void handleSubmit(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="temporary-password">Temporary password</FieldLabel>
            <Input
              autoComplete="current-password"
              id="temporary-password"
              minLength={8}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </Field>
          <PasswordFields
            confirmPassword={confirmPassword}
            newPassword={newPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onNewPasswordChange={setNewPassword}
          />
        </FieldGroup>
        <Button disabled={pending} type="submit">
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Save password
        </Button>
      </form>
    </PasswordShell>
  );
}

function PasswordForm({
  confirmPassword,
  newPassword,
  pending,
  submitLabel,
  onConfirmPasswordChange,
  onNewPasswordChange,
  onSubmit
}: {
  confirmPassword: string;
  newPassword: string;
  pending: boolean;
  submitLabel: string;
  onConfirmPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}): React.ReactElement {
  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <FieldGroup>
        <PasswordFields
          confirmPassword={confirmPassword}
          newPassword={newPassword}
          onConfirmPasswordChange={onConfirmPasswordChange}
          onNewPasswordChange={onNewPasswordChange}
        />
      </FieldGroup>
      <Button disabled={pending} type="submit">
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}

function PasswordFields({
  confirmPassword,
  newPassword,
  onConfirmPasswordChange,
  onNewPasswordChange
}: {
  confirmPassword: string;
  newPassword: string;
  onConfirmPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
}): React.ReactElement {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="new-password">New password</FieldLabel>
        <Input
          autoComplete="new-password"
          id="new-password"
          minLength={8}
          onChange={(event) => onNewPasswordChange(event.target.value)}
          required
          type="password"
          value={newPassword}
        />
        <FieldDescription>Use at least 8 characters.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
        <Input
          autoComplete="new-password"
          id="confirm-password"
          minLength={8}
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </Field>
    </>
  );
}

function PasswordShell({
  children,
  description,
  footer,
  title
}: {
  children: React.ReactNode;
  description: string;
  footer?: React.ReactNode;
  title: string;
}): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-center gap-2">
          <img alt="" className="h-7 w-auto" src="/logo.svg" />
          <span className="text-sm font-medium">HQBase</span>
        </div>
        <Card className="bg-card/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-lg font-medium tracking-tight">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
          {footer ? <CardFooter className="justify-center">{footer}</CardFooter> : null}
        </Card>
      </div>
    </main>
  );
}
