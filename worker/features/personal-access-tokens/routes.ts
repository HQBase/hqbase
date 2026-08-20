import { Hono } from "hono";

import { requireAuthContext, requireRecentSession } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { enforceRateLimit } from "../../security/rate-limit";

import {
  createPersonalAccessToken,
  listPersonalAccessTokens,
  revokePersonalAccessToken
} from "./service";
import { readCreatePersonalAccessTokenInput } from "./validation";

export const personalAccessTokenRoutes = new Hono<HonoApp>();

personalAccessTokenRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  return c.json(
    await listPersonalAccessTokens(c.env.DB, {
      userId: auth.user.id,
      role: auth.user.role
    })
  );
});

personalAccessTokenRoutes.post("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRecentSession(auth);
  await enforceRateLimit(c.env.DB, c.env.BETTER_AUTH_SECRET, {
    scope: "pat.create",
    subject: auth.user.id,
    limit: 5,
    windowSeconds: 60 * 60
  });

  let rawInput: unknown;
  try {
    rawInput = await readJson(c.req.raw);
  } catch (error) {
    if (error instanceof AppError && error.code === "INVALID_JSON") {
      throw new AppError(
        "INVALID_PERSONAL_ACCESS_TOKEN",
        "Personal access token input is invalid.",
        400
      );
    }
    throw error;
  }

  const input = readCreatePersonalAccessTokenInput(rawInput);
  const result = await createPersonalAccessToken(c.env.DB, {
    ...input,
    userId: auth.user.id,
    correlationId: c.get("correlationId")
  });
  return c.json(result, 201);
});

personalAccessTokenRoutes.delete("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const result = await revokePersonalAccessToken(c.env.DB, {
    id: c.req.param("id"),
    actorId: auth.user.id,
    actorRole: auth.user.role,
    correlationId: c.get("correlationId")
  });
  if (result === "not-found") {
    throw new AppError("PERSONAL_ACCESS_TOKEN_NOT_FOUND", "Personal access token not found.", 404);
  }
  return c.body(null, 204);
});
