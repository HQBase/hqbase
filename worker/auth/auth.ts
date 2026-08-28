import { oauthDeviceAuthorization, oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createDatabase } from "../db/drizzle";
import {
  accounts,
  deviceCodes,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  oauthResources,
  sessions,
  users,
  verifications
} from "../db/schema";
import { recordAudit } from "../features/audit/service";
import { sendPasswordSetupEmail } from "../features/users/email";
import type { WorkerEnv } from "../lib/env";
import { adminRole, memberRole, ownerRole } from "./access";
import { hashOAuthToken } from "./oauth-token";
import { completePasswordSetup } from "./password-setup";

const passwordSetupTokenLifetimeSeconds = 7 * 24 * 60 * 60;
type BackgroundTaskHandler = (promise: Promise<unknown>) => void;

export function createAuth(
  env: WorkerEnv,
  request: Request,
  backgroundTaskHandler?: BackgroundTaskHandler
) {
  const baseURL = authOrigin(env, request);
  const mailApiResources = [mailApiResource(env, request), mailApiV1Resource(env, request)];

  return betterAuth({
    appName: "HQBase",
    basePath: "/api/auth",
    baseURL,
    trustedOrigins: async (request) => {
      if (!request) return [];
      try {
        const host = new URL(request.url).hostname;
        if (host === "localhost" || host === "127.0.0.1") {
          return ["http://localhost:5173", "http://127.0.0.1:5173"];
        }
      } catch {}
      return [];
    },
    database: drizzleAdapter(createDatabase(env.DB), {
      provider: "sqlite",
      schema: {
        account: accounts,
        deviceCode: deviceCodes,
        oauthAccessToken: oauthAccessTokens,
        oauthClient: oauthClients,
        oauthClientAssertion: oauthClientAssertions,
        oauthClientResource: oauthClientResources,
        oauthConsent: oauthConsents,
        oauthRefreshToken: oauthRefreshTokens,
        oauthResource: oauthResources,
        session: sessions,
        user: users,
        verification: verifications
      },
      transaction: false
    }),
    disabledPaths: ["/token"],
    secret: env.BETTER_AUTH_SECRET,
    ...(backgroundTaskHandler
      ? { advanced: { backgroundTasks: { handler: backgroundTaskHandler } } }
      : {}),
    account: {
      fields: {
        accountId: "providerAccountId"
      }
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: passwordSetupTokenLifetimeSeconds,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordSetupEmail(env, { user, url });
      },
      onPasswordReset: async ({ user }) => {
        const completedSetup = await completePasswordSetup(env.DB, user.id);
        await recordAudit(env.DB, {
          correlationId: crypto.randomUUID(),
          actorType: "user",
          actorId: user.id,
          action: completedSetup ? "user.password.setup" : "user.password.reset",
          resourceType: "user",
          resourceId: user.id,
          outcome: "success",
          metadata: {}
        });
      }
    },
    plugins: [
      admin({
        defaultRole: "member",
        adminRoles: ["owner", "admin"],
        roles: {
          owner: ownerRole,
          admin: adminRole,
          member: memberRole
        }
      }),
      // Better Auth 1.7 RC currently publishes an OAuth provider endpoint type whose
      // OpenAPI metadata is narrower than BetterAuthPlugin. Keep the concrete plugin
      // type for API inference while upstream resolves the declaration mismatch.
      // @ts-expect-error Upstream @better-auth/oauth-provider 1.7 declaration mismatch.
      oauthProvider({
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationAllowedResources: [
          mcpResource(env, request),
          mcpFullResource(env, request),
          ...mailApiResources
        ],
        clientRegistrationAllowedScopes: ["mail:write", "mail:send", "offline_access"],
        clientRegistrationDefaultScopes: ["mail:read"],
        consentPage: "/oauth/consent",
        disableJwtPlugin: true,
        grantTypes: ["authorization_code", "refresh_token"],
        loginPage: "/",
        refreshTokenReuseInterval: 30,
        prefix: {
          clientSecret: "hqb_client_",
          opaqueAccessToken: "hqb_access_",
          refreshToken: "hqb_refresh_"
        },
        scopes: ["mail:read", "mail:write", "mail:send", "offline_access"],
        storeTokens: { hash: hashOAuthToken },
        resources: [mcpResource(env, request), mcpFullResource(env, request), ...mailApiResources],
        enforcePerClientResources: false
      }),
      oauthDeviceAuthorization({
        expiresIn: "15m",
        interval: "5s",
        verificationUri: "/device"
      })
    ]
  });
}

export function authOrigin(env: WorkerEnv, request: Request): string {
  return (env.BETTER_AUTH_URL || new URL(request.url).origin).replace(/\/$/, "");
}

export function authIssuer(env: WorkerEnv, request: Request): string {
  return `${authOrigin(env, request)}/api/auth`;
}

export function mcpResource(env: WorkerEnv, request: Request): string {
  return `${authOrigin(env, request)}/mcp`;
}

export function mcpFullResource(env: WorkerEnv, request: Request): string {
  return `${authOrigin(env, request)}/mcp/full`;
}

export function mailApiResource(env: WorkerEnv, request: Request): string {
  return `${authOrigin(env, request)}/api/v2`;
}

export function mailApiV1Resource(env: WorkerEnv, request: Request): string {
  return `${authOrigin(env, request)}/api/v1`;
}
