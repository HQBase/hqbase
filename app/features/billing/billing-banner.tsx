import { CircleAlert } from "lucide-react";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { EntitlementStatus } from "./types";

export function BillingBanner({
  status
}: {
  status: EntitlementStatus;
}): React.ReactElement | null {
  const copy = bannerCopy(status);
  if (!copy) return null;
  return (
    <Alert
      aria-live="polite"
      className="rounded-none border-x-0 border-t-0"
      variant={copy.destructive ? "destructive" : "default"}
    >
      <CircleAlert aria-hidden="true" />
      <AlertTitle>
        <span className="sr-only">License status: </span>
        {copy.title}
      </AlertTitle>
      <AlertDescription>{copy.description}</AlertDescription>
    </Alert>
  );
}

function bannerCopy(
  status: EntitlementStatus
): { title: string; description: string; destructive: boolean } | null {
  if (status.state === "active") return null;
  if (status.state === "unlicensed") {
    return {
      title: "Activate HQBase Pro",
      description: "Open Settings → Billing and enter the HQB_ license key from Polar.",
      destructive: false
    };
  }
  if (status.state === "canceling") {
    return {
      title: "Your subscription will not renew",
      description: status.currentPeriodEnd
        ? `Pro remains active through ${formatDate(status.currentPeriodEnd)}.`
        : "Pro remains active through the current paid period.",
      destructive: false
    };
  }
  if (status.state === "past_due") {
    return {
      title: "Payment needs attention",
      description: "Update the payment method in Polar while payment recovery is active.",
      destructive: false
    };
  }
  if (status.state === "grace") {
    return {
      title: "Pro is in a safety grace period",
      description: status.graceEndsAt
        ? `Renew by ${formatDate(status.graceEndsAt)} to keep changing workspace configuration. Mail keeps working.`
        : "Renew to keep changing workspace configuration. Mail keeps working.",
      destructive: false
    };
  }
  return {
    title: "Pro administration is paused",
    description:
      "Renew to add or change domains, users, permissions, aliases, and app passwords. Mail keeps working.",
    destructive: true
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
