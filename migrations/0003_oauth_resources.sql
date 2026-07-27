CREATE TABLE account_next (
  id TEXT PRIMARY KEY NOT NULL,
  issuer TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

INSERT INTO account_next (
  id,
  issuer,
  providerAccountId,
  providerId,
  userId,
  accessToken,
  refreshToken,
  idToken,
  accessTokenExpiresAt,
  refreshTokenExpiresAt,
  scope,
  password,
  createdAt,
  updatedAt
)
SELECT
  id,
  CASE
    WHEN providerId = 'credential' THEN 'local:credential'
    ELSE 'local:oauth:' || providerId
  END,
  accountId,
  providerId,
  userId,
  accessToken,
  refreshToken,
  idToken,
  accessTokenExpiresAt,
  refreshTokenExpiresAt,
  scope,
  password,
  createdAt,
  updatedAt
FROM account;

DROP TABLE account;
ALTER TABLE account_next RENAME TO account;

CREATE UNIQUE INDEX account_issuer_providerAccountId_uidx
ON account(issuer, providerAccountId);
CREATE INDEX account_userId_idx ON account(userId);

ALTER TABLE oauthClient ADD COLUMN backchannelLogoutUri TEXT;
ALTER TABLE oauthClient ADD COLUMN backchannelLogoutSessionRequired INTEGER;
ALTER TABLE oauthClient ADD COLUMN jwks TEXT;
ALTER TABLE oauthClient ADD COLUMN jwksUri TEXT;
ALTER TABLE oauthClient ADD COLUMN dpopBoundAccessTokens INTEGER DEFAULT 0;

CREATE TABLE oauthResource (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  accessTokenTtl INTEGER,
  refreshTokenTtl INTEGER,
  signingAlgorithm TEXT,
  signingKeyId TEXT,
  allowedScopes TEXT,
  customClaims TEXT,
  dpopBoundAccessTokensRequired INTEGER DEFAULT 0,
  disabled INTEGER DEFAULT 0,
  createdAt TEXT,
  updatedAt TEXT,
  policyVersion INTEGER DEFAULT 1,
  metadata TEXT
);

CREATE TABLE oauthClientResource (
  id TEXT PRIMARY KEY NOT NULL,
  clientId TEXT NOT NULL REFERENCES oauthClient(clientId) ON DELETE CASCADE,
  resourceId TEXT NOT NULL REFERENCES oauthResource(identifier) ON DELETE CASCADE,
  metadata TEXT,
  createdAt TEXT
);

CREATE INDEX oauthClientResource_clientId_idx ON oauthClientResource(clientId);
CREATE INDEX oauthClientResource_resourceId_idx ON oauthClientResource(resourceId);

ALTER TABLE oauthRefreshToken ADD COLUMN authorizationCodeId TEXT;
ALTER TABLE oauthRefreshToken ADD COLUMN resources TEXT;
ALTER TABLE oauthRefreshToken ADD COLUMN requestedUserInfoClaims TEXT;
ALTER TABLE oauthRefreshToken ADD COLUMN rotatedAt TEXT;
ALTER TABLE oauthRefreshToken ADD COLUMN rotationReplayResponse TEXT;
ALTER TABLE oauthRefreshToken ADD COLUMN rotationReplayExpiresAt TEXT;
ALTER TABLE oauthRefreshToken ADD COLUMN confirmation TEXT;

CREATE INDEX oauthRefreshToken_authorizationCodeId_idx
ON oauthRefreshToken(authorizationCodeId);

ALTER TABLE oauthAccessToken ADD COLUMN authorizationCodeId TEXT;
ALTER TABLE oauthAccessToken ADD COLUMN resources TEXT;
ALTER TABLE oauthAccessToken ADD COLUMN requestedUserInfoClaims TEXT;
ALTER TABLE oauthAccessToken ADD COLUMN revoked TEXT;
ALTER TABLE oauthAccessToken ADD COLUMN confirmation TEXT;

CREATE INDEX oauthAccessToken_authorizationCodeId_idx
ON oauthAccessToken(authorizationCodeId);

ALTER TABLE oauthConsent ADD COLUMN resources TEXT;
ALTER TABLE oauthConsent ADD COLUMN requestedUserInfoClaims TEXT;

CREATE TABLE oauthClientAssertion (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt TEXT NOT NULL
);
