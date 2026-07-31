export type UnreadCounts = {
  catchall: number;
  inbox: number;
  inboxByMailbox: Record<string, number>;
  total: number;
};

export type PushSubscriptionInput = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

export type PushSubscriptionRow = {
  auth_key: string;
  endpoint: string;
  expiration_time: number | null;
  id: string;
  p256dh_key: string;
  role: string | null;
  user_id: string;
};
