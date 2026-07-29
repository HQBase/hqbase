export type UnreadCounts = {
  catchall: number;
  inbox: number;
  total: number;
};

export type NotificationStatus = {
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
  refresh: () => Promise<void>;
  unread: UnreadCounts;
};
