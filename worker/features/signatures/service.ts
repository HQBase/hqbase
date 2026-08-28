import { accessibleMailboxIds, requireMailboxAccess } from "../../auth/mailbox-access";
import type { HumanPrincipal, RequestPrincipal } from "../../auth/principal";
import { newId, nowIso } from "../../db/client";
import { AppError } from "../../lib/errors";
import { findMailboxForSending } from "../mailboxes/queries";
import { sanitizeSignatureContent } from "./content";
import { findSignature, listCandidateSignatures, listManagedSignatures } from "./queries";
import type {
  Signature,
  SignatureScopeTarget,
  SignatureSelection,
  SignatureSnapshot
} from "./types";

type SignaturePrincipal =
  | RequestPrincipal
  | { id: string; role: HumanPrincipal["role"]; type: "user" };

export async function listUsableSignatures(
  db: D1Database,
  principal: SignaturePrincipal,
  from: string
): Promise<{ automaticSignatureId: string | null; signatures: Signature[] }> {
  const mailbox = await requireSendingMailbox(db, principal, from);
  const signatures = await listCandidateSignatures(db, {
    userId: principal.type === "user" ? principal.id : null,
    mailboxId: mailbox.id,
    mailDomainId: mailbox.mailDomainId
  });
  return {
    automaticSignatureId: automaticSignature(signatures)?.id ?? null,
    signatures
  };
}

export async function resolveSignatureSelection(
  db: D1Database,
  principal: SignaturePrincipal,
  from: string,
  selection: SignatureSelection
): Promise<SignatureSnapshot> {
  if (selection.mode === "none") return emptySignatureSnapshot("none");
  if (!from) {
    if (selection.mode === "automatic") return emptySignatureSnapshot("automatic");
    throw unavailableSignature();
  }
  const candidates = await listUsableSignatures(db, principal, from);
  const signature =
    selection.mode === "automatic"
      ? candidates.signatures.find((item) => item.id === candidates.automaticSignatureId)
      : candidates.signatures.find((item) => item.id === selection.id);
  if (selection.mode === "selected" && !signature) throw unavailableSignature();
  return signature ? snapshot(selection.mode, signature) : emptySignatureSnapshot(selection.mode);
}

export async function resolveDraftSignature(
  db: D1Database,
  principal: SignaturePrincipal,
  input: {
    from: string;
    selection?: SignatureSelection | undefined;
    current?: { from: string; signature: SignatureSnapshot } | undefined;
  }
): Promise<SignatureSnapshot> {
  if (input.selection) {
    return resolveSignatureSelection(db, principal, input.from, input.selection);
  }
  if (!input.current) return emptySignatureSnapshot("none");
  if (input.current.from.toLowerCase() === input.from.toLowerCase()) {
    return input.current.signature;
  }
  const current = input.current.signature;
  if (current.mode === "automatic" || (current.mode === "selected" && !current.id)) {
    return resolveSignatureSelection(db, principal, input.from, { mode: "automatic" });
  }
  if (current.mode === "none") return emptySignatureSnapshot("none");
  if (!input.from) return emptySignatureSnapshot("automatic");
  const candidates = await listUsableSignatures(db, principal, input.from);
  return candidates.signatures.some((item) => item.id === current.id)
    ? current
    : resolveSignatureSelection(db, principal, input.from, { mode: "automatic" });
}

export async function resolveSendSignature(
  db: D1Database,
  principal: SignaturePrincipal,
  input: { from: string; selection?: SignatureSelection | undefined },
  draft?: { from: string; signature: SignatureSnapshot } | null
): Promise<SignatureSnapshot> {
  if (draft && draft.from.toLowerCase() !== input.from.toLowerCase()) {
    throw new AppError(
      "DRAFT_FROM_MISMATCH",
      "The send request does not match the draft From address.",
      400
    );
  }
  if (draft) return draft.signature;
  if (input.selection) {
    return resolveSignatureSelection(db, principal, input.from, input.selection);
  }
  return emptySignatureSnapshot("none");
}

export async function listManageableSignatures(
  db: D1Database,
  actor: HumanPrincipal
): Promise<Signature[]> {
  return listManagedSignatures(db, {
    userId: actor.id,
    mailboxIds: await accessibleMailboxIds(db, actor.id, actor.role, "manager"),
    includeDomains: actor.role === "owner" || actor.role === "admin"
  });
}

export async function createSignature(
  db: D1Database,
  actor: HumanPrincipal,
  input: {
    name: string;
    html: string;
    scope: SignatureScopeTarget;
    isDefault: boolean;
  }
): Promise<Signature> {
  await requireManageScope(db, actor, input.scope);
  const content = sanitizeSignatureContent(input);
  const id = newId("sig");
  const timestamp = nowIso();
  const scope = scopeColumns(input.scope);
  const statements: D1PreparedStatement[] = [];
  if (input.isDefault) {
    statements.push(clearDefaultStatement(db, input.scope, actor.id, timestamp));
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO email_signatures
         (id, name, html_body, text_body, user_id, mailbox_id, mail_domain_id, is_default,
          created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        content.name,
        content.html,
        content.text,
        scope.userId,
        scope.mailboxId,
        scope.mailDomainId,
        input.isDefault ? 1 : 0,
        actor.id,
        actor.id,
        timestamp,
        timestamp
      )
  );
  await runSignatureWrite(db, statements);
  return requiredSignature(db, id);
}

export async function updateSignature(
  db: D1Database,
  actor: HumanPrincipal,
  id: string,
  input: { name?: string | undefined; html?: string | undefined; isDefault?: boolean | undefined }
): Promise<Signature> {
  const current = await requiredSignature(db, id);
  const scope = signatureScope(current);
  await requireManageScope(db, actor, scope);
  const content =
    input.name !== undefined || input.html !== undefined
      ? sanitizeSignatureContent({
          name: input.name ?? current.name,
          html: input.html ?? current.html
        })
      : { name: current.name, html: current.html, text: current.text };
  const statements: D1PreparedStatement[] = [];
  const timestamp = nowIso();
  if (input.isDefault === true) {
    statements.push(clearDefaultStatement(db, scope, actor.id, timestamp));
  }
  statements.push(
    db
      .prepare(
        `UPDATE email_signatures
         SET name = ?, html_body = ?, text_body = ?, is_default = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        content.name,
        content.html,
        content.text,
        (input.isDefault ?? current.isDefault) ? 1 : 0,
        actor.id,
        timestamp,
        id
      )
  );
  await runSignatureWrite(db, statements);
  return requiredSignature(db, id);
}

export async function deleteSignature(
  db: D1Database,
  actor: HumanPrincipal,
  id: string
): Promise<void> {
  const current = await requiredSignature(db, id);
  await requireManageScope(db, actor, signatureScope(current));
  await db.prepare("DELETE FROM email_signatures WHERE id = ?").bind(id).run();
}

export function emptySignatureSnapshot(mode: SignatureSnapshot["mode"]): SignatureSnapshot {
  return { mode, id: null, name: "", html: "", text: "" };
}

async function requireSendingMailbox(db: D1Database, principal: SignaturePrincipal, from: string) {
  const mailbox = await findMailboxForSending(db, from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  if (!mailbox.isActive) {
    throw new AppError("MAILBOX_DISABLED", "Disabled mailboxes cannot send email.", 400);
  }
  await requireMailboxAccess(db, principal.id, principal.role, mailbox.id, "agent");
  return mailbox;
}

async function requireManageScope(
  db: D1Database,
  actor: HumanPrincipal,
  scope: SignatureScopeTarget
): Promise<void> {
  if (scope.type === "user") {
    if (scope.id !== actor.id) throw forbiddenSignature();
    return;
  }
  if (scope.type === "mailbox") {
    try {
      await requireMailboxAccess(db, actor.id, actor.role, scope.id, "manager");
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      throw forbiddenSignature();
    }
    return;
  }
  if (actor.role !== "owner" && actor.role !== "admin") throw forbiddenSignature();
  const domain = await db
    .prepare("SELECT id FROM mail_domains WHERE id = ?")
    .bind(scope.id)
    .first<{ id: string }>();
  if (!domain) throw new AppError("SIGNATURE_NOT_FOUND", "Signature target not found.", 404);
}

function automaticSignature(signatures: Signature[]): Signature | null {
  for (const scope of ["mailbox", "user", "domain"] as const) {
    const selected = signatures.find((item) => item.scope === scope && item.isDefault);
    if (selected) return selected;
  }
  return null;
}

function snapshot(mode: SignatureSnapshot["mode"], signature: Signature): SignatureSnapshot {
  return {
    mode,
    id: signature.id,
    name: signature.name,
    html: signature.html,
    text: signature.text
  };
}

function signatureScope(signature: Signature): SignatureScopeTarget {
  return { type: signature.scope, id: signature.scopeId };
}

function scopeColumns(scope: SignatureScopeTarget): {
  userId: string | null;
  mailboxId: string | null;
  mailDomainId: string | null;
} {
  return {
    userId: scope.type === "user" ? scope.id : null,
    mailboxId: scope.type === "mailbox" ? scope.id : null,
    mailDomainId: scope.type === "domain" ? scope.id : null
  };
}

function clearDefaultStatement(
  db: D1Database,
  scope: SignatureScopeTarget,
  actorId: string,
  timestamp: string
): D1PreparedStatement {
  const column =
    scope.type === "user" ? "user_id" : scope.type === "mailbox" ? "mailbox_id" : "mail_domain_id";
  return db
    .prepare(
      `UPDATE email_signatures
       SET is_default = 0, updated_by = ?, updated_at = ?
       WHERE ${column} = ? AND is_default = 1`
    )
    .bind(actorId, timestamp, scope.id);
}

async function requiredSignature(db: D1Database, id: string): Promise<Signature> {
  const signature = await findSignature(db, id);
  if (!signature) throw new AppError("SIGNATURE_NOT_FOUND", "Signature not found.", 404);
  return signature;
}

async function runSignatureWrite(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE constraint failed: email_signatures")) {
      throw new AppError(
        "SIGNATURE_NAME_CONFLICT",
        "That scope already contains a signature with this name.",
        409
      );
    }
    throw error;
  }
}

function unavailableSignature(): AppError {
  return new AppError(
    "SIGNATURE_NOT_AVAILABLE",
    "This signature is not available for the selected From address.",
    400
  );
}

function forbiddenSignature(): AppError {
  return new AppError("SIGNATURE_FORBIDDEN", "You cannot manage this signature scope.", 403);
}
