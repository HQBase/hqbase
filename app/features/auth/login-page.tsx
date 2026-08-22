import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "./api";
import { authenticationPath, safeAuthenticationReturnPath } from "./password-recovery";

type LoginPageProps = {
  onLogin: () => void;
};

export function LoginPage({ onLogin }: LoginPageProps): React.ReactElement {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);
  const currentPath =
    typeof window === "undefined"
      ? "/"
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const forgotPasswordPath = authenticationPath(
    "/forgot-password",
    safeAuthenticationReturnPath(
      currentPath,
      typeof window === "undefined" ? undefined : window.location.origin
    )
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    try {
      const redirectUrl = await signIn(email, password);
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }
      onLogin();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-rail px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-center gap-2">
          <img alt="" className="h-7 w-auto rounded-md object-contain" src="/logo.svg" />
        </div>
        <section className="overflow-hidden rounded-[24px] border bg-sidebar shadow-sm">
          <header className="px-6 pb-2 pt-5">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          </header>
          <form
            className="flex flex-col gap-4 px-6 pb-6 pt-3"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label
              className="flex flex-col gap-2 text-xs text-muted-foreground"
              htmlFor="login-email"
            >
              Login email
              <Input
                autoComplete="email"
                className="h-10 bg-background shadow-none focus-visible:ring-1"
                id="login-email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="login-password">Password</label>
                <a
                  className="text-foreground underline-offset-4 hover:underline"
                  href={forgotPasswordPath}
                >
                  Forgot password?
                </a>
              </div>
              <Input
                autoComplete="current-password"
                className="h-10 bg-background shadow-none focus-visible:ring-1"
                id="login-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            <Button
              className="mt-1 h-11 rounded-full"
              disabled={isPending}
              type="submit"
              variant="liquidGlass"
            >
              {isPending ? "Signing in" : "Continue"}
            </Button>
          </form>
        </section>
        <p className="mt-4 text-center text-[11px] text-tertiary">Self-hosted on Cloudflare</p>
      </div>
    </main>
  );
}
