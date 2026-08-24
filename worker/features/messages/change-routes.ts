import { Hono } from "hono";

import { mailApiBasePath, requireMailApiPrincipal } from "../../auth/mail-api";
import { accessibleMessageScope } from "../../auth/mailbox-access";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { labelsForMessageIds } from "../labels/queries";

import { defaultChangeLimit, listMessageChanges, maxChangeLimit } from "./change-queries";

export const changeRoutes = new Hono<HonoApp>();

changeRoutes.get("/", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:read");
  for (const name of ["mailboxId", "folder", "labelId", "search"]) {
    if (c.req.query(name) !== undefined) {
      throw new AppError(
        "INVALID_CHANGE_FILTER",
        "The changes feed does not accept mailbox, folder, label, or search filters.",
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
  const page = await listMessageChanges(c.env.DB, {
    cursor: c.req.query("cursor"),
    limit: parseChangeLimit(c.req.query("limit")),
    scope
  });
  if (mailApiBasePath(c.req.raw) === "/api/v1") return c.json(page);
  const assignments = await labelsForMessageIds(
    c.env.DB,
    page.changes.flatMap((change) => (change.type === "upsert" ? [change.message.id] : []))
  );
  return c.json({
    ...page,
    changes: page.changes.map((change) =>
      change.type === "upsert"
        ? {
            ...change,
            message: {
              ...change.message,
              labels: assignments.get(change.message.id) ?? []
            }
          }
        : change
    )
  });
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
