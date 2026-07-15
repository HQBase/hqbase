import { ArrowUpRight, X } from "lucide-react";
import * as React from "react";
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
import { cn } from "@/lib/cn";
import { type ProCheckoutPlacement, proCheckoutUrl } from "@/lib/pro-checkout";

export function ProUpgradeCard({
  description,
  dismissible = false,
  placement,
  title
}: {
  description: string;
  dismissible?: boolean;
  placement: ProCheckoutPlacement;
  title: string;
}): React.ReactElement | null {
  const storageKey = `hqbase-pro-dismissed:${placement}`;
  const [dismissed, setDismissed] = React.useState(false);

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
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <CardDescription className="max-w-2xl text-xs leading-5">{description}</CardDescription>
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
        $19/month or $190/year per production workspace. Checkout returns to the guided Cloudflare
        deployment for either a fresh Pro workspace or an upgrade that keeps Community data.
      </CardContent>
      <CardFooter>
        <Button asChild size="sm">
          <a href={proCheckoutUrl(placement)} rel="noreferrer" target="_blank">
            Upgrade to Pro
            <ArrowUpRight data-icon="inline-end" />
          </a>
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
    <a
      className={cn(
        "inline-flex items-center gap-1 text-xs text-foreground hover:underline",
        className
      )}
      href={proCheckoutUrl(placement)}
      rel="noreferrer"
      target="_blank"
    >
      {children}
      <ArrowUpRight data-icon="inline-end" />
    </a>
  );
}
