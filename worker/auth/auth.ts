import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

import type { WorkerEnv } from "../lib/env";

import { adminRole, memberRole, ownerRole } from "./access";
import { hashOAuthToken } from "./oauth-token";

export function createAuth(env: WorkerEnv, request: Request) {
  const baseURL = authOrigin(env, request);

  return betterAuth({
    appName: "HQBase",
    basePath: "/api/auth",
    baseURL,
    database: env.DB,
    disabledPaths: ["/token"],
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: false
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
      oauthProvider({
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationAllowedScopes: ["mail:write", "mail:send", "offline_access"],
        clientRegistrationDefaultScopes: ["mail:read"],
        consentPage: "/mcp/consent",
        disableJwtPlugin: true,
        grantTypes: ["authorization_code", "refresh_token"],
        loginPage: "/",
        prefix: {
          clientSecret: "hqb_client_",
          opaqueAccessToken: "hqb_access_",
          refreshToken: "hqb_refresh_"
        },
        scopes: ["mail:read", "mail:write", "mail:send", "offline_access"],
        storeTokens: { hash: hashOAuthToken },
        validAudiences: [mcpResource(env, request)]
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
