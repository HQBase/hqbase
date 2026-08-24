import { Hono } from "hono";
import type { z } from "zod";

import { requireMailApiPrincipal } from "../../auth/mail-api";
import { humanPrincipal } from "../../auth/principal";
import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { emailAddressSchema } from "../../lib/validation";
import { recordAudit } from "../audit/service";

import { findSignature } from "./queries";
import {
  createSignature,
  deleteSignature,
  listManageableSignatures,
  listUsableSignatures,
  updateSignature
} from "./service";
import type { Signature, SignatureScopeTarget } from "./types";
import { createSignatureSchema, updateSignatureSchema } from "./validation";

export const signatureRoutes = new Hono<HonoApp>();
export const mailSignatureRoutes = new Hono<HonoApp>();

signatureRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  return c.json(await listManageableSignatures(c.env.DB, humanPrincipal(auth)));
});

signatureRoutes.post("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const actor = humanPrincipal(auth);
  const input = signatureInput(createSignatureSchema, await readJson(c.req.raw));
  try {
    const signature = await createSignature(c.env.DB, actor, input);
    await recordSignatureAudit(c.env.DB, {
      action: "signature.create",
      actorId: actor.id,
      correlationId: c.get("correlationId"),
      outcome: "success",
      signature
    });
    if (input.isDefault) {
      await recordSignatureAudit(c.env.DB, {
        action: "signature.default.change",
        actorId: actor.id,
        correlationId: c.get("correlationId"),
        outcome: "success",
        signature
      });
    }
    return c.json(signature, 201);
  } catch (error) {
    await recordDeniedSignatureAudit(c.env.DB, error, {
      action: "signature.create",
      actorId: actor.id,
      correlationId: c.get("correlationId"),
      scope: input.scope
    });
    if (input.isDefault) {
      await recordDeniedSignatureAudit(c.env.DB, error, {
        action: "signature.default.change",
        actorId: actor.id,
        correlationId: c.get("correlationId"),
        scope: input.scope
      });
    }
    throw error;
  }
});

signatureRoutes.patch("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const actor = humanPrincipal(auth);
  const id = c.req.param("id");
  const input = signatureInput(updateSignatureSchema, await readJson(c.req.raw));
  const current = await findSignature(c.env.DB, id);
  try {
    const signature = await updateSignature(c.env.DB, actor, id, input);
    await recordSignatureAudit(c.env.DB, {
      action: "signature.update",
      actorId: actor.id,
      correlationId: c.get("correlationId"),
      outcome: "success",
      signature
    });
    if (input.isDefault !== undefined && input.isDefault !== current?.isDefault) {
      await recordSignatureAudit(c.env.DB, {
        action: "signature.default.change",
        actorId: actor.id,
        correlationId: c.get("correlationId"),
        outcome: "success",
        signature
      });
    }
    return c.json(signature);
  } catch (error) {
    await recordDeniedSignatureAudit(c.env.DB, error, {
      action: "signature.update",
      actorId: actor.id,
      correlationId: c.get("correlationId"),
      id,
      scope: current ? signatureScope(current) : undefined
    });
    if (input.isDefault !== undefined && input.isDefault !== current?.isDefault) {
      await recordDeniedSignatureAudit(c.env.DB, error, {
        action: "signature.default.change",
        actorId: actor.id,
        correlationId: c.get("correlationId"),
        id,
        scope: current ? signatureScope(current) : undefined
      });
    }
    throw error;
  }
});

signatureRoutes.delete("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const actor = humanPrincipal(auth);
  const id = c.req.param("id");
  const current = await findSignature(c.env.DB, id);
  try {
    await deleteSignature(c.env.DB, actor, id);
    if (!current) throw new AppError("SIGNATURE_NOT_FOUND", "Signature not found.", 404);
    await recordSignatureAudit(c.env.DB, {
      action: "signature.delete",
      actorId: actor.id,
      correlationId: c.get("correlationId"),
      outcome: "success",
      signature: current
    });
    if (current.isDefault) {
      await recordSignatureAudit(c.env.DB, {
        action: "signature.default.change",
        actorId: actor.id,
        correlationId: c.get("correlationId"),
        outcome: "success",
        signature: current
      });
    }
    return c.body(null, 204);
  } catch (error) {
    await recordDeniedSignatureAudit(c.env.DB, error, {
      action: "signature.delete",
      actorId: actor.id,
      correlationId: c.get("correlationId"),
      id,
      scope: current ? signatureScope(current) : undefined
    });
    if (current?.isDefault) {
      await recordDeniedSignatureAudit(c.env.DB, error, {
        action: "signature.default.change",
        actorId: actor.id,
        correlationId: c.get("correlationId"),
        id,
        scope: signatureScope(current)
      });
    }
    throw error;
  }
});

mailSignatureRoutes.get("/", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  const from = emailAddressSchema.safeParse(c.req.query("from"));
  if (!from.success) {
    throw new AppError("SIGNATURE_INVALID", "A valid From address is required.", 400);
  }
  return c.json(await listUsableSignatures(c.env.DB, auth.principal, from.data));
});

function signatureInput<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      "SIGNATURE_INVALID",
      result.error.issues[0]?.message ?? "Signature is invalid.",
      400
    );
  }
  return result.data;
}

function signatureScope(signature: Signature): SignatureScopeTarget {
  return { type: signature.scope, id: signature.scopeId };
}

async function recordDeniedSignatureAudit(
  db: D1Database,
  error: unknown,
  input: {
    action: string;
    actorId: string;
    correlationId: string;
    id?: string | undefined;
    scope?: SignatureScopeTarget | undefined;
  }
): Promise<void> {
  if (!(error instanceof AppError) || error.code !== "SIGNATURE_FORBIDDEN") return;
  await recordAudit(db, {
    action: input.action,
    actorId: input.actorId,
    actorType: "user",
    correlationId: input.correlationId,
    ...(input.scope ? { metadata: { scopeType: input.scope.type, targetId: input.scope.id } } : {}),
    outcome: "denied",
    resourceId: input.id ?? null,
    resourceType: "signature"
  });
}

function recordSignatureAudit(
  db: D1Database,
  input: {
    action: string;
    actorId: string;
    correlationId: string;
    outcome: "success" | "denied";
    signature: Signature;
  }
): Promise<void> {
  return recordAudit(db, {
    action: input.action,
    actorId: input.actorId,
    actorType: "user",
    correlationId: input.correlationId,
    metadata: { scopeType: input.signature.scope, targetId: input.signature.scopeId },
    outcome: input.outcome,
    resourceId: input.signature.id,
    resourceType: "signature"
  });
}
