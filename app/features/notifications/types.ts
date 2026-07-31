export type UnreadCounts = {
  catchall: number;
  inbox: number;
  inboxByMailbox: Record<string, number>;
  total: number;
};

export type NotificationStatus = {
  latestInboundMessageId: string | null;
  unread: UnreadCounts;
  vapidPublicKey: string | null;
};

export type NotificationDeviceState =
  | "checking"
  | "enabled"
  | "available"
  | "blocked"
  | "unsupported"
  | "unconfigured";

export type NotificationController = {
  deviceState: NotificationDeviceState;
  disable: () => Promise<void>;
  enable: () => Promise<void>;
  error: string | null;
  isBusy: boolean;
  refresh: () => Promise<NotificationStatus>;
  unread: UnreadCounts;
};
