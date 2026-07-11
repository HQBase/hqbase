export type AppPassword = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type CreatedAppPassword = {
  appPassword: AppPassword;
  password: string;
};
