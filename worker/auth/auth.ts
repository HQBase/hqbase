import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

import type { WorkerEnv } from "../lib/env";

import { adminRole, memberRole, ownerRole } from "./access";

export function createAuth(env: WorkerEnv, request: Request) {
  const requestUrl = new URL(request.url);
  const baseURL = env.BETTER_AUTH_URL || requestUrl.origin;

  return betterAuth({
    appName: "HQBase",
    basePath: "/api/auth",
    baseURL,
    database: env.DB,
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
      })
    ]
  });
}
