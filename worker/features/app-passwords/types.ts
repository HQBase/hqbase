export type AppPasswordRow = {
  id: string;
  user_id: string;
  name: string;
  secret_hash: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export type AppPassword = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};
