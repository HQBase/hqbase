import type { MiddlewareHandler } from "hono";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { getEntitlementStatus } from "./queries";

export const requireConfigurationEntitlement: MiddlewareHandler<HonoApp> = async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") {
    await next();
    return;
  }
  const entitlement = await getEntitlementStatus(c.env.DB);
  if (!entitlement.canConfigure) {
    throw new AppError(
      "PRO_SUBSCRIPTION_REQUIRED",
      "Renew HQBase Pro before changing workspace configuration. Mail continues to work.",
      402
    );
  }
  await next();
};
