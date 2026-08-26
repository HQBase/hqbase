import { Hono } from "hono";

import { parseOAuthList } from "../../auth/oauth-principal";
import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { auditStatement } from "../audit/service";

type ConnectionRow = {
  clientId: string;
  clientName: string | null;
  createdAt: string;
  resources: string | null;
  scopes: string;
  updatedAt: string;
};

export const oauthConnectionRoutes = new Hono<HonoApp>();

oauthConnectionRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const result = await c.env.DB.prepare(
    `SELECT consent.clientId, client.name AS clientName, consent.scopes, consent.resources,
            consent.createdAt, consent.updatedAt
     FROM oauthConsent consent
     JOIN oauthClient client ON client.clientId = consent.clientId
     WHERE consent.userId = ?
     ORDER BY consent.updatedAt DESC`
  )
    .bind(auth.user.id)
    .all<ConnectionRow>();

  const connections = new Map<
    string,
    {
      clientId: string;
      name: string;
      scopes: Set<string>;
      resources: Set<string>;
      createdAt: string;
      updatedAt: string;
    }
  >();
  for (const row of result.results) {
    const connection = connections.get(row.clientId) ?? {
      clientId: row.clientId,
      name: row.clientName?.trim() || "OAuth client",
      scopes: new Set<string>(),
      resources: new Set<string>(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
    for (const scope of parseOAuthList(row.scopes)) connection.scopes.add(scope);
    for (const resource of parseOAuthList(row.resources)) connection.resources.add(resource);
    if (row.createdAt < connection.createdAt) connection.createdAt = row.createdAt;
    if (row.updatedAt > connection.updatedAt) connection.updatedAt = row.updatedAt;
    connections.set(row.clientId, connection);
  }

  return c.json({
    connections: [...connections.values()].map((connection) => ({
      clientId: connection.clientId,
      name: connection.name,
      scopes: [...connection.scopes],
      resources: [...connection.resources],
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt
    }))
  });
});

oauthConnectionRoutes.delete("/:clientId", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const clientId = c.req.param("clientId");
  const consent = await c.env.DB.prepare(
    "SELECT id FROM oauthConsent WHERE clientId = ? AND userId = ? LIMIT 1"
  )
    .bind(clientId, auth.user.id)
    .first<{ id: string }>();
  if (!consent) {
    throw new AppError("OAUTH_CONNECTION_NOT_FOUND", "Connected app not found.", 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauthAccessToken WHERE clientId = ? AND userId = ?").bind(
      clientId,
      auth.user.id
    ),
    c.env.DB.prepare("DELETE FROM oauthRefreshToken WHERE clientId = ? AND userId = ?").bind(
      clientId,
      auth.user.id
    ),
    c.env.DB.prepare("DELETE FROM oauthConsent WHERE clientId = ? AND userId = ?").bind(
      clientId,
      auth.user.id
    ),
    auditStatement(c.env.DB, {
      correlationId: c.get("correlationId"),
      actorType: "user",
      actorId: auth.user.id,
      action: "oauth.connection.revoke",
      resourceType: "oauth_client",
      resourceId: clientId,
      outcome: "success"
    })
  ]);
  return c.body(null, 204);
});
