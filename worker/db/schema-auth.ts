import { relations, sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

const authDateText = customType<{ data: Date | string; driverData: string }>({
  dataType: () => "text",
  fromDriver: (value) => value,
  toDriver: (value) => (value instanceof Date ? value.toISOString() : value)
});

export const users = sqliteTable("user", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: authDateText("createdAt").notNull(),
  updatedAt: authDateText("updatedAt").notNull(),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }),
  banReason: text("banReason"),
  banExpires: authDateText("banExpires")
});

export const personalAccessTokens = sqliteTable(
  "personal_access_tokens",
  {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenSuffix: text("token_suffix").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at")
  },
  (table) => [
    check("personal_access_tokens_name_check", sql`length(trim(${table.name})) BETWEEN 1 AND 80`),
    check(
      "personal_access_tokens_token_hash_check",
      sql`length(${table.tokenHash}) = 43 AND ${table.tokenHash} NOT GLOB '*[^A-Za-z0-9_-]*'`
    ),
    check(
      "personal_access_tokens_token_suffix_check",
      sql`length(${table.tokenSuffix}) = 4 AND ${table.tokenSuffix} NOT GLOB '*[^A-Za-z0-9_-]*'`
    ),
    check(
      "personal_access_tokens_created_at_check",
      sql`length(${table.createdAt}) = 24 AND substr(${table.createdAt}, 24, 1) = 'Z'`
    ),
    check(
      "personal_access_tokens_expires_at_check",
      sql`${table.expiresAt} IS NULL OR (length(${table.expiresAt}) = 24 AND substr(${table.expiresAt}, 24, 1) = 'Z')`
    ),
    check(
      "personal_access_tokens_revoked_at_check",
      sql`${table.revokedAt} IS NULL OR (length(${table.revokedAt}) = 24 AND substr(${table.revokedAt}, 24, 1) = 'Z')`
    ),
    index("personal_access_tokens_user_idx").on(table.userId, sql`${table.createdAt} DESC`),
    index("personal_access_tokens_list_idx").on(sql`${table.createdAt} DESC`, sql`${table.id} DESC`)
  ]
);

export const sessions = sqliteTable(
  "session",
  {
    id: text("id").primaryKey().notNull(),
    expiresAt: authDateText("expiresAt").notNull(),
    token: text("token").notNull().unique(),
    createdAt: authDateText("createdAt").notNull(),
    updatedAt: authDateText("updatedAt").notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonatedBy")
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const accounts = sqliteTable(
  "account",
  {
    id: text("id").primaryKey().notNull(),
    issuer: text("issuer").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: authDateText("accessTokenExpiresAt"),
    refreshTokenExpiresAt: authDateText("refreshTokenExpiresAt"),
    scope: text("scope"),
    password: text("password"),
    createdAt: authDateText("createdAt").notNull(),
    updatedAt: authDateText("updatedAt").notNull()
  },
  (table) => [
    uniqueIndex("account_issuer_providerAccountId_uidx").on(table.issuer, table.providerAccountId),
    index("account_userId_idx").on(table.userId)
  ]
);

export const verifications = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey().notNull(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: authDateText("expiresAt").notNull(),
    createdAt: authDateText("createdAt").notNull(),
    updatedAt: authDateText("updatedAt").notNull()
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const oauthClients = sqliteTable(
  "oauthClient",
  {
    id: text("id").primaryKey().notNull(),
    clientId: text("clientId").notNull().unique(),
    clientSecret: text("clientSecret"),
    disabled: integer("disabled", { mode: "boolean" }).default(sql`0`),
    skipConsent: integer("skipConsent", { mode: "boolean" }),
    enableEndSession: integer("enableEndSession", { mode: "boolean" }),
    subjectType: text("subjectType"),
    scopes: text("scopes"),
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    createdAt: authDateText("createdAt"),
    updatedAt: authDateText("updatedAt"),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts"),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("softwareId"),
    softwareVersion: text("softwareVersion"),
    softwareStatement: text("softwareStatement"),
    redirectUris: text("redirectUris").notNull(),
    postLogoutRedirectUris: text("postLogoutRedirectUris"),
    tokenEndpointAuthMethod: text("tokenEndpointAuthMethod"),
    grantTypes: text("grantTypes"),
    responseTypes: text("responseTypes"),
    public: integer("public", { mode: "boolean" }),
    type: text("type"),
    requirePKCE: integer("requirePKCE", { mode: "boolean" }),
    referenceId: text("referenceId"),
    metadata: text("metadata"),
    backchannelLogoutUri: text("backchannelLogoutUri"),
    backchannelLogoutSessionRequired: integer("backchannelLogoutSessionRequired", {
      mode: "boolean"
    }),
    jwks: text("jwks"),
    jwksUri: text("jwksUri"),
    dpopBoundAccessTokens: integer("dpopBoundAccessTokens", { mode: "boolean" }).default(sql`0`),
    clientDiscoveryId: text("clientDiscoveryId"),
    clientCredentialsScopes: text("clientCredentialsScopes"),
    applicationType: text("applicationType")
  },
  (table) => [index("oauthClient_userId_idx").on(table.userId)]
);

export const oauthResources = sqliteTable("oauthResource", {
  id: text("id").primaryKey().notNull(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("accessTokenTtl"),
  refreshTokenTtl: integer("refreshTokenTtl"),
  signingAlgorithm: text("signingAlgorithm"),
  signingKeyId: text("signingKeyId"),
  allowedScopes: text("allowedScopes"),
  customClaims: text("customClaims"),
  dpopBoundAccessTokensRequired: integer("dpopBoundAccessTokensRequired", {
    mode: "boolean"
  }).default(sql`0`),
  disabled: integer("disabled", { mode: "boolean" }).default(sql`0`),
  createdAt: authDateText("createdAt"),
  updatedAt: authDateText("updatedAt"),
  policyVersion: integer("policyVersion").default(1),
  metadata: text("metadata")
});

export const oauthRefreshTokens = sqliteTable(
  "oauthRefreshToken",
  {
    id: text("id").primaryKey().notNull(),
    token: text("token").notNull().unique(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    sessionId: text("sessionId").references(() => sessions.id, { onDelete: "set null" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    expiresAt: authDateText("expiresAt").notNull(),
    createdAt: authDateText("createdAt").notNull(),
    revoked: authDateText("revoked"),
    authTime: authDateText("authTime"),
    scopes: text("scopes").notNull(),
    authorizationCodeId: text("authorizationCodeId"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requestedUserInfoClaims"),
    rotatedAt: authDateText("rotatedAt"),
    rotationReplayResponse: text("rotationReplayResponse"),
    rotationReplayExpiresAt: authDateText("rotationReplayExpiresAt"),
    confirmation: text("confirmation")
  },
  (table) => [
    index("oauthRefreshToken_clientId_idx").on(table.clientId),
    index("oauthRefreshToken_sessionId_idx").on(table.sessionId),
    index("oauthRefreshToken_userId_idx").on(table.userId),
    index("oauthRefreshToken_authorizationCodeId_idx").on(table.authorizationCodeId)
  ]
);

export const oauthAccessTokens = sqliteTable(
  "oauthAccessToken",
  {
    id: text("id").primaryKey().notNull(),
    token: text("token").notNull().unique(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    sessionId: text("sessionId").references(() => sessions.id, { onDelete: "set null" }),
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    refreshId: text("refreshId").references(() => oauthRefreshTokens.id, { onDelete: "cascade" }),
    expiresAt: authDateText("expiresAt").notNull(),
    createdAt: authDateText("createdAt").notNull(),
    scopes: text("scopes").notNull(),
    authorizationCodeId: text("authorizationCodeId"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requestedUserInfoClaims"),
    revoked: authDateText("revoked"),
    confirmation: text("confirmation")
  },
  (table) => [
    index("oauthAccessToken_clientId_idx").on(table.clientId),
    index("oauthAccessToken_sessionId_idx").on(table.sessionId),
    index("oauthAccessToken_userId_idx").on(table.userId),
    index("oauthAccessToken_refreshId_idx").on(table.refreshId),
    index("oauthAccessToken_authorizationCodeId_idx").on(table.authorizationCodeId)
  ]
);

export const oauthConsents = sqliteTable(
  "oauthConsent",
  {
    id: text("id").primaryKey().notNull(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("referenceId"),
    scopes: text("scopes").notNull(),
    createdAt: authDateText("createdAt").notNull(),
    updatedAt: authDateText("updatedAt").notNull(),
    resources: text("resources"),
    requestedUserInfoClaims: text("requestedUserInfoClaims")
  },
  (table) => [
    index("oauthConsent_clientId_idx").on(table.clientId),
    index("oauthConsent_userId_idx").on(table.userId)
  ]
);

export const oauthClientResources = sqliteTable(
  "oauthClientResource",
  {
    id: text("id").primaryKey().notNull(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    resourceId: text("resourceId")
      .notNull()
      .references(() => oauthResources.identifier, { onDelete: "cascade" }),
    metadata: text("metadata"),
    createdAt: authDateText("createdAt")
  },
  (table) => [
    index("oauthClientResource_clientId_idx").on(table.clientId),
    index("oauthClientResource_resourceId_idx").on(table.resourceId),
    uniqueIndex("oauthClientResource_clientId_resourceId_uidx").on(table.clientId, table.resourceId)
  ]
);

export const oauthClientAssertions = sqliteTable("oauthClientAssertion", {
  id: text("id").primaryKey().notNull(),
  expiresAt: authDateText("expiresAt").notNull()
});

export const deviceCodes = sqliteTable(
  "deviceCode",
  {
    id: text("id").primaryKey().notNull(),
    deviceCode: text("deviceCode").notNull().unique(),
    userCode: text("userCode").notNull().unique(),
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: authDateText("expiresAt").notNull(),
    status: text("status", { enum: ["pending", "approved", "denied"] }).notNull(),
    lastPolledAt: authDateText("lastPolledAt"),
    pollingInterval: integer("pollingInterval"),
    clientId: text("clientId").references(() => oauthClients.clientId, { onDelete: "cascade" }),
    scope: text("scope"),
    resources: text("resources"),
    oauthClientId: text("oauthClientId").references(() => oauthClients.clientId, {
      onDelete: "cascade"
    }),
    sessionId: text("sessionId").references(() => sessions.id, { onDelete: "set null" })
  },
  (table) => [
    check("deviceCode_status_check", sql`${table.status} IN ('pending', 'approved', 'denied')`),
    index("deviceCode_userId_idx").on(table.userId),
    index("deviceCode_clientId_idx").on(table.clientId),
    index("deviceCode_oauthClientId_idx").on(table.oauthClientId),
    index("deviceCode_expiresAt_idx").on(table.expiresAt)
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] })
}));
