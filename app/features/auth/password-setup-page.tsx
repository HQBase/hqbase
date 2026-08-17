import { CheckCircle2, KeyRound } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  completeTemporaryPasswordSetup,
  requestPasswordReset,
  resetPassword,
  signOut
} from "./api";
import { authenticationPath } from "./password-recovery";
import { PasswordShell } from "./password-shell";
import type { CurrentUser } from "./types";

export function ForgotPasswordPage({ returnTo }: { returnTo: string }): React.ReactElement {
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [complete, setComplete] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const redirectPath = authenticationPath("/reset-password", returnTo);
      await requestPasswordReset(email, new URL(redirectPath, window.location.origin).href);
      setComplete(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The password reset request could not be submitted."
      );
    } finally {
      setPending(false);
    }
  }

  if (complete) {
    return (
      <PasswordShell
        description="The response is the same for every Login email to keep HQBase accounts private."
        title="Check your email"
      >
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Reset link requested</AlertTitle>
          <AlertDescription>
            If an account uses that Login email, HQBase sent a single-use link that expires in seven
            days.
          </AlertDescription>
        </Alert>
        <Button onClick={() => window.location.assign(returnTo)} type="button" variant="outline">
          Return to sign in
        </Button>
      </PasswordShell>
    );
  }

  return (
    <PasswordShell
      description="Enter your Login email. HQBase will send a reset link if the account exists."
      title="Forgot your password?"
    >
      <form className="flex flex-col gap-5" onSubmit={(event) => void handleSubmit(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="recovery-email">Login email</FieldLabel>
            <Input
              autoComplete="email"
              id="recovery-email"
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </Field>
        </FieldGroup>
        <Button disabled={pending} type="submit">
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Send reset link
        </Button>
        <Button onClick={() => window.location.assign(returnTo)} type="button" variant="ghost">
          Return to sign in
        </Button>
      </form>
    </PasswordShell>
  );
}

export function InvitationPasswordSetupPage({
  token,
  error
}: {
  token: string | null;
  error: string | null;
}): React.ReactElement {
  return <TokenPasswordPage error={error} flow="invitation" returnTo="/" token={token} />;
}

export function PasswordResetPage({
  token,
  error,
  returnTo
}: {
  token: string | null;
  error: string | null;
  returnTo: string;
}): React.ReactElement {
  return <TokenPasswordPage error={error} flow="reset" returnTo={returnTo} token={token} />;
}

function TokenPasswordPage({
  token,
  error,
  flow,
  returnTo
}: {
  token: string | null;
  error: string | null;
  flow: "invitation" | "reset";
  returnTo: string;
}): React.ReactElement {
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [complete, setComplete] = React.useState(false);
  const invalid = !token || error === "INVALID_TOKEN";
  const resetting = flow === "reset";

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
      window.history.replaceState(
        {},
        "",
        resetting ? authenticationPath("/reset-password", returnTo) : "/set-password"
      );
      setComplete(true);
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Password update failed.");
    } finally {
      setPending(false);
    }
  }

  if (complete) {
    return (
      <PasswordShell
        description={
          resetting
            ? "Your password has changed. Sign in again with your Login email."
            : "Your password is ready. Sign in with your Login email to enter the workspace."
        }
        title={resetting ? "Password changed" : "Invitation accepted"}
      >
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{resetting ? "Account recovered" : "Password created"}</AlertTitle>
          <AlertDescription>
            {resetting
              ? "Your previous HQBase sessions have ended."
              : "Your workspace identity is now active."}
          </AlertDescription>
        </Alert>
        <Button onClick={() => window.location.assign(returnTo)} type="button">
          Continue to sign in
        </Button>
      </PasswordShell>
    );
  }

  return (
    <PasswordShell
      description={
        resetting
          ? "Choose a new password for your Login email."
          : "Choose the password you’ll use with your Login email."
      }
      title={resetting ? "Reset your password" : "Set up your password"}
    >
      {invalid ? (
        <>
          <Alert variant="destructive">
            <KeyRound />
            <AlertTitle>
              {resetting ? "Reset link unavailable" : "Invitation link unavailable"}
            </AlertTitle>
            <AlertDescription>
              {resetting
                ? "This link is invalid, expired, or has already been used. Request a new reset link."
                : "This link is invalid, expired, or has already been used. Ask a workspace administrator to resend the invitation."}
            </AlertDescription>
          </Alert>
          <Button
            onClick={() =>
              window.location.assign(
                resetting ? authenticationPath("/forgot-password", returnTo) : "/"
              )
            }
            type="button"
            variant="outline"
          >
            {resetting ? "Request a new link" : "Return to sign in"}
          </Button>
        </>
      ) : (
        <PasswordForm
          confirmPassword={confirmPassword}
          newPassword={newPassword}
          pending={pending}
          submitLabel={resetting ? "Reset password" : "Create password"}
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
          maxLength={128}
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
          maxLength={128}
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
