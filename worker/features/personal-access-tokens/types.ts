export type PersonalAccessTokenMetadata = {
  id: string;
  userId: string;
  ownerName: string;
  name: string;
  tokenSuffix: string;
  createdAt: string;
  expiresAt: string | null;
};

export type PersonalAccessTokenList = {
  personalAccessTokens: PersonalAccessTokenMetadata[];
};

export type CreatePersonalAccessTokenInput = {
  name: string;
  expiresAt: string | null;
};

export type PersonalAccessTokenMetadataRow = {
  id: unknown;
  userId: unknown;
  ownerName: unknown;
  name: unknown;
  tokenSuffix: unknown;
  createdAt: unknown;
  expiresAt: unknown;
};
