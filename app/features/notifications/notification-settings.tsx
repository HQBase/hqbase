import { Bell, BellOff } from "lucide-react";
import type * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/features/settings/settings-section";
import type { NotificationController, NotificationDeviceState } from "./types";

export function NotificationSettings({
  notifications
}: {
  notifications: NotificationController;
}): React.ReactElement {
  const stateCopy = copyForState(notifications.deviceState);
  return (
    <SettingsSection
      action={
        notifications.deviceState === "enabled" ? (
          <Button
            disabled={notifications.isBusy}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void notifications.disable()}
          >
            <BellOff />
            {notifications.isBusy ? "Disabling…" : "Disable on this device"}
          </Button>
        ) : (
          <Button
            disabled={
              notifications.isBusy ||
              notifications.deviceState === "checking" ||
              notifications.deviceState === "blocked" ||
              notifications.deviceState === "unsupported" ||
              notifications.deviceState === "unconfigured"
            }
            size="sm"
            type="button"
            onClick={() => void notifications.enable()}
          >
            <Bell />
            {notifications.isBusy ? "Enabling…" : "Enable notifications"}
          </Button>
        )
      }
      description="New-mail alerts and unread badges for this browser or installed app"
      title="Notifications"
    >
      <div className="divide-y border-y text-sm">
        <div className="flex items-start justify-between gap-6 py-3">
          <div>
            <p className="font-medium">This device</p>
            <p className="mt-1 text-xs text-muted-foreground">{stateCopy.description}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{stateCopy.label}</span>
        </div>
        <div className="flex items-start justify-between gap-6 py-3">
          <div>
            <p className="font-medium">Unread mail</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Inbox and Catch-all messages you can access
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs">
            <span className="sr-only">{notifications.unread.total} unread messages</span>
            <span aria-hidden="true">{notifications.unread.total}</span>
          </span>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Notifications use a minimal encrypted payload with an unread count and an HQBase route.
        Sender, recipient, subject, message text, and attachment details are never included.
        Enabling another device does not disable this one.
      </p>
      {notifications.deviceState === "blocked" ? (
        <Alert>
          <AlertDescription>
            Notifications are blocked. Allow HQBase in your browser or system notification settings,
            then return here.
          </AlertDescription>
        </Alert>
      ) : null}
      {notifications.error ? (
        <Alert variant="destructive">
          <AlertDescription>{notifications.error}</AlertDescription>
        </Alert>
      ) : null}
    </SettingsSection>
  );
}

function copyForState(state: NotificationDeviceState): {
  description: string;
  label: string;
} {
  switch (state) {
    case "enabled":
      return {
        description: "This device receives visible alerts when accessible mail arrives.",
        label: "Enabled"
      };
    case "available":
      return {
        description: "Permission is requested only after you choose Enable notifications.",
        label: "Off"
      };
    case "blocked":
      return {
        description: "Permission is disabled in the browser or operating-system settings.",
        label: "Blocked"
      };
    case "unsupported":
      return {
        description:
          "Install HQBase to the iOS Home Screen, or use a browser that supports Web Push.",
        label: "Unavailable"
      };
    case "unconfigured":
      return {
        description: "This installation needs its generated Web Push keys before alerts can start.",
        label: "Unavailable"
      };
    case "checking":
      return { description: "Checking this device and installation.", label: "Checking" };
  }
}
