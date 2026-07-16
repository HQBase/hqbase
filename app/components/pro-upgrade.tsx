import { ArrowUpRight, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { startProUpgrade } from "@/features/upgrades/api";
import { cn } from "@/lib/cn";
import type { ProCheckoutPlacement } from "@/lib/pro-checkout";

export function ProUpgradeCard({
  description,
  dismissible = false,
  placement
}: {
  description: string;
  dismissible?: boolean;
  placement: ProCheckoutPlacement;
  title: string;
}): React.ReactElement | null {
  const storageKey = `hqbase-pro-dismissed:${placement}`;
  const [dismissed, setDismissed] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (dismissible) setDismissed(window.localStorage.getItem(storageKey) === "1");
  }, [dismissible, storageKey]);

  if (dismissed) return null;

  return (
    <Card className="relative overflow-hidden bg-background/55 shadow-none">
      <CardHeader className="pr-12">
        <div className="mb-1">
          <Badge variant="outline">Pro</Badge>
        </div>
        <CardTitle className="text-sm font-medium">Upgrade this workspace to Pro</CardTitle>
        <CardDescription className="max-w-2xl text-xs leading-5">
          HQBase will securely detect your existing Cloudflare resources, back up your workspace,
          and upgrade it in place. Your domains, users, and mail remain unchanged.
        </CardDescription>
      </CardHeader>
      {dismissible ? (
        <Button
          aria-label="Dismiss Pro suggestion"
          className="absolute right-3 top-3"
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => {
            window.localStorage.setItem(storageKey, "1");
            setDismissed(true);
          }}
        >
          <X data-icon="inline-start" />
        </Button>
      ) : null}
      <CardContent className="pb-3 text-xs text-muted-foreground">
        {description} $19/month or $190/year per production workspace.
      </CardContent>
      <CardFooter>
        <Button
          disabled={pending}
          size="sm"
          type="button"
          onClick={() => void beginUpgrade(setPending)}
        >
          {pending ? "Preparing secure checkout…" : "Upgrade to Pro"}
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ProUpgradeLink({
  children,
  className,
  placement
}: {
  children: React.ReactNode;
  className?: string;
  placement: ProCheckoutPlacement;
}): React.ReactElement {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1 text-xs text-foreground hover:underline",
        className
      )}
      type="button"
      data-placement={placement}
      onClick={() => void beginUpgrade(() => undefined)}
    >
      {children}
      <ArrowUpRight data-icon="inline-end" />
    </button>
  );
}

async function beginUpgrade(setPending: (pending: boolean) => void): Promise<void> {
  setPending(true);
  try {
    const purchase = await startProUpgrade();
    window.location.assign(purchase.checkoutUrl);
  } catch (error) {
    setPending(false);
    toast.error(error instanceof Error ? error.message : "Upgrade checkout could not start.");
  }
}
