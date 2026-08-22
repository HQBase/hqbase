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

export type CreatePersonalAccessTokenResponse = {
  personalAccessToken: PersonalAccessTokenMetadata;
  token: string;
};
