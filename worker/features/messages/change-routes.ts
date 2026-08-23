import { Hono } from "hono";

import { requireMailApiPrincipal } from "../../auth/mail-api";
import { accessibleMessageScope } from "../../auth/mailbox-access";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";

import { defaultChangeLimit, listMessageChanges, maxChangeLimit } from "./change-queries";

export const changeRoutes = new Hono<HonoApp>();

changeRoutes.get("/", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:read");
  for (const name of ["mailboxId", "folder", "search"]) {
    if (c.req.query(name) !== undefined) {
      throw new AppError(
        "INVALID_CHANGE_FILTER",
        "The changes feed does not accept mailbox, folder, or search filters.",
        400
      );
    }
  }
  const scope = await accessibleMessageScope(
    c.env.DB,
    auth.principal.id,
    auth.principal.role,
    "read"
  );
  return c.json(
    await listMessageChanges(c.env.DB, {
      cursor: c.req.query("cursor"),
      limit: parseChangeLimit(c.req.query("limit")),
      scope
    })
  );
});

function parseChangeLimit(value: string | undefined): number {
  if (value === undefined) return defaultChangeLimit;
  const limit = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isInteger(limit) || limit < 1 || limit > maxChangeLimit) {
    throw new AppError(
      "INVALID_LIMIT",
      `Limit must be an integer from 1 to ${maxChangeLimit}.`,
      400
    );
  }
  return limit;
}
