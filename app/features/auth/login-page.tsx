import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { signIn } from "./api";

type LoginPageProps = {
  onLogin: () => void;
};

export function LoginPage({ onLogin }: LoginPageProps): React.ReactElement {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    try {
      await signIn(email, password);
      onLogin();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex items-center justify-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md border bg-card font-mono text-[10px] font-semibold">
            HQ
          </span>
          <span className="text-sm font-medium">HQBase</span>
        </div>
        <Card className="bg-card/70 shadow-none">
          <CardHeader className="space-y-1 pb-5">
            <CardTitle className="text-lg font-medium tracking-tight">Sign in</CardTitle>
            <CardDescription className="text-xs">Your workspace email</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
              <label
                className="flex flex-col gap-2 text-xs text-muted-foreground"
                htmlFor="login-email"
              >
                Email
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
              <label
                className="flex flex-col gap-2 text-xs text-muted-foreground"
                htmlFor="login-password"
              >
                Password
                <Input
                  autoComplete="current-password"
                  className="h-10 bg-background shadow-none focus-visible:ring-1"
                  id="login-password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <Button className="mt-1 h-10" disabled={isPending} type="submit">
                {isPending ? "Signing in" : "Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Self-hosted on Cloudflare
        </p>
      </div>
    </main>
  );
}
