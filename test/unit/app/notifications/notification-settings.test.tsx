import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NotificationSettings } from "@/features/notifications/notification-settings";
import type { NotificationController } from "@/features/notifications/types";

describe("notification settings", () => {
  it("shows the current unread count, device scope, and minimal payload boundary", () => {
    const html = renderToStaticMarkup(
      <NotificationSettings notifications={controller("enabled")} />
    );
    expect(html).toContain("Disable on this device");
    expect(html).toContain("3 unread messages");
    expect(html).toContain("minimal encrypted payload");
    expect(html).toContain("Sender, recipient, subject, message text");
    expect(html).toContain("Enabling another device does not disable this one.");
  });

  it("keeps blocked and unsupported permission controls non-actionable", () => {
    const blocked = renderToStaticMarkup(
      <NotificationSettings notifications={controller("blocked")} />
    );
    const unsupported = renderToStaticMarkup(
      <NotificationSettings notifications={controller("unsupported")} />
    );
    expect(blocked).toContain("Notifications are blocked.");
    expect(blocked).toContain("disabled");
    expect(unsupported).toContain("Install HQBase to the iOS Home Screen");
    expect(unsupported).toContain("disabled");
  });
});

function controller(deviceState: NotificationController["deviceState"]): NotificationController {
  return {
    deviceState,
    disable: async () => undefined,
    enable: async () => undefined,
    error: null,
    isBusy: false,
    refresh: async () => ({
      latestInboundMessageId: null,
      unread: { catchall: 1, inbox: 2, inboxByMailbox: { "mailbox-1": 2 }, total: 3 },
      vapidPublicKey: "public-key"
    }),
    unread: { catchall: 1, inbox: 2, inboxByMailbox: { "mailbox-1": 2 }, total: 3 }
  };
}
