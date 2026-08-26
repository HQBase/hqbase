import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { HumanPrincipal } from "../../../worker/auth/principal";
import { getDraft, saveDraft } from "../../../worker/features/drafts/queries";
import {
  createSignature,
  deleteSignature,
  listManageableSignatures,
  listUsableSignatures,
  resolveDraftSignature,
  resolveSendSignature,
  resolveSignatureSelection,
  updateSignature
} from "../../../worker/features/signatures/service";
import type { Signature } from "../../../worker/features/signatures/types";
import { applyCurrentMigrations } from "./current-migrations";

const timestamp = "2026-08-24T12:00:00.000Z";
const owner: HumanPrincipal = {
  id: "usr_signature_owner",
  type: "user",
  name: "Signature Owner",
  email: "signature-owner@login.example",
  role: "owner"
};
const member: HumanPrincipal = {
  id: "usr_signature_member",
  type: "user",
  name: "Signature Member",
  email: "signature-member@login.example",
  role: "member"
};

let personal: Signature;
let mailbox: Signature;
let secondMailbox: Signature;
let domain: Signature;
let disposable: Signature;

describe("email signatures", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    await env.DB.batch([
      userRow(owner),
      userRow(member),
      env.DB.prepare(
        `INSERT INTO mail_domains
           (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
           VALUES
             ('dom_signature_one', 'signature-one.example', 'ready', 'ready', 'ready', 1, ?, ?),
             ('dom_signature_two', 'signature-two.example', 'ready', 'ready', 'ready', 1, ?, ?),
             ('dom_signature_three', 'signature-three.example', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(timestamp, timestamp, timestamp, timestamp, timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes
           (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
           VALUES
             ('mbx_signature_one', 'one@signature-one.example', 'dom_signature_one', 'One', 1, ?, ?),
             ('mbx_signature_two', 'two@signature-two.example', 'dom_signature_two', 'Two', 1, ?, ?),
             ('mbx_signature_three', 'three@signature-three.example', 'dom_signature_three', 'Three', 1, ?, ?)`
      ).bind(timestamp, timestamp, timestamp, timestamp, timestamp, timestamp),
      grantRow("mbx_signature_one", member.id, "agent"),
      grantRow("mbx_signature_two", member.id, "agent"),
      env.DB.prepare(
        `INSERT INTO principals (id, type, name, status, created_at, updated_at)
         VALUES ('agt_signature', 'agent', 'Signature Agent', 'active', ?, ?)`
      ).bind(timestamp, timestamp),
      grantRow("mbx_signature_one", "agt_signature", "agent"),
      grantRow("mbx_signature_three", "agt_signature", "agent")
    ]);

    personal = await createSignature(env.DB, member, {
      name: "Personal",
      html: "<p>Member</p>",
      scope: { type: "user", id: member.id },
      isDefault: true
    });
    mailbox = await createSignature(env.DB, owner, {
      name: "Mailbox one",
      html: "<p>Mailbox one</p>",
      scope: { type: "mailbox", id: "mbx_signature_one" },
      isDefault: true
    });
    secondMailbox = await createSignature(env.DB, owner, {
      name: "Mailbox two",
      html: "<p>Mailbox two</p>",
      scope: { type: "mailbox", id: "mbx_signature_two" },
      isDefault: true
    });
    domain = await createSignature(env.DB, owner, {
      name: "Domain one",
      html: "<p>Domain one</p>",
      scope: { type: "domain", id: "dom_signature_one" },
      isDefault: true
    });
    disposable = await createSignature(env.DB, owner, {
      name: "Disposable",
      html: "<p>Saved copy</p>",
      scope: { type: "mailbox", id: "mbx_signature_one" },
      isDefault: false
    });
  });

  it("resolves exact-address candidates and default precedence", async () => {
    const initial = await listUsableSignatures(env.DB, member, "one@signature-one.example");
    expect(initial.automaticSignatureId).toBe(mailbox.id);
    expect(initial.signatures.map((signature) => signature.id)).toEqual(
      expect.arrayContaining([personal.id, mailbox.id, domain.id])
    );
    expect(initial.signatures.map((signature) => signature.id)).not.toContain(secondMailbox.id);

    await updateSignature(env.DB, owner, mailbox.id, { isDefault: false });
    expect(
      (await listUsableSignatures(env.DB, member, "one@signature-one.example")).automaticSignatureId
    ).toBe(personal.id);
    await updateSignature(env.DB, member, personal.id, { isDefault: false });
    expect(
      (await listUsableSignatures(env.DB, member, "one@signature-one.example")).automaticSignatureId
    ).toBe(domain.id);
    await updateSignature(env.DB, member, personal.id, { isDefault: true });
    await updateSignature(env.DB, owner, mailbox.id, { isDefault: true });
  });

  it("does not expose personal signatures to machine agents", async () => {
    const result = await listUsableSignatures(
      env.DB,
      {
        id: "agt_signature",
        type: "agent",
        name: "Signature Agent",
        role: null,
        profile: "mailbox"
      },
      "one@signature-one.example"
    );
    expect(result.signatures.map((signature) => signature.id)).not.toContain(personal.id);
    expect(result.automaticSignatureId).toBe(mailbox.id);
  });

  it("uses the sole applicable signature when no default exists", async () => {
    const agent = {
      id: "agt_signature",
      type: "agent" as const,
      name: "Signature Agent",
      role: null,
      profile: "mailbox" as const
    };
    const only = await createSignature(env.DB, owner, {
      name: "Only domain signature",
      html: "<p>Only domain signature</p>",
      scope: { type: "domain", id: "dom_signature_three" },
      isDefault: false
    });

    expect(
      (await listUsableSignatures(env.DB, agent, "three@signature-three.example"))
        .automaticSignatureId
    ).toBe(only.id);

    await createSignature(env.DB, owner, {
      name: "Second domain signature",
      html: "<p>Second domain signature</p>",
      scope: { type: "domain", id: "dom_signature_three" },
      isDefault: false
    });
    expect(
      (await listUsableSignatures(env.DB, agent, "three@signature-three.example"))
        .automaticSignatureId
    ).toBeNull();
  });

  it("enforces management and selected-signature access", async () => {
    expect((await listManageableSignatures(env.DB, member)).map((item) => item.id)).toEqual([
      personal.id
    ]);
    await expect(
      createSignature(env.DB, member, {
        name: "Forbidden shared",
        html: "<p>Forbidden</p>",
        scope: { type: "mailbox", id: "mbx_signature_one" },
        isDefault: false
      })
    ).rejects.toMatchObject({ code: "SIGNATURE_FORBIDDEN", status: 403 });
    await expect(
      createSignature(env.DB, member, {
        name: "PERSONAL",
        html: "<p>Duplicate</p>",
        scope: { type: "user", id: member.id },
        isDefault: false
      })
    ).rejects.toMatchObject({ code: "SIGNATURE_NAME_CONFLICT", status: 409 });
    await expect(
      resolveSignatureSelection(env.DB, member, "one@signature-one.example", {
        mode: "selected",
        id: secondMailbox.id
      })
    ).rejects.toMatchObject({ code: "SIGNATURE_NOT_AVAILABLE", status: 400 });
  });

  it("stores draft snapshots, preserves omission, and reconciles From changes", async () => {
    const automatic = await resolveSignatureSelection(env.DB, member, "one@signature-one.example", {
      mode: "automatic"
    });
    const saved = await saveDraft(env.DB, member.id, {
      mailboxId: "mbx_signature_one",
      replyToMessageId: null,
      forwardOfMessageId: null,
      from: "one@signature-one.example",
      to: ["reader@example.com"],
      cc: [],
      bcc: [],
      subject: "Snapshot",
      text: "Hello",
      html: "<p>Hello</p>",
      signature: automatic
    });
    expect(saved.signature).toMatchObject({ mode: "automatic", id: mailbox.id });
    await expect(
      resolveSendSignature(
        env.DB,
        member,
        {
          from: "one@signature-one.example",
          selection: { mode: "none" }
        },
        saved
      )
    ).resolves.toEqual(saved.signature);

    const updated = await saveDraft(env.DB, member.id, {
      ...saved,
      subject: "Snapshot updated",
      version: saved.version,
      signature: undefined
    });
    expect(updated.signature).toEqual(saved.signature);

    const selected = await resolveSignatureSelection(env.DB, member, "one@signature-one.example", {
      mode: "selected",
      id: mailbox.id
    });
    const changedFrom = await resolveDraftSignature(env.DB, member, {
      from: "two@signature-two.example",
      current: { from: "one@signature-one.example", signature: selected }
    });
    expect(changedFrom).toMatchObject({ mode: "automatic", id: secondMailbox.id });

    const legacy = await saveDraft(env.DB, member.id, {
      mailboxId: null,
      replyToMessageId: null,
      forwardOfMessageId: null,
      from: "",
      to: [],
      cc: [],
      bcc: [],
      subject: "Legacy",
      text: "",
      html: ""
    });
    expect(legacy.signature).toEqual({ mode: "none", id: null, name: "", html: "", text: "" });
  });

  it("keeps a draft snapshot after its source signature is deleted", async () => {
    const selected = await resolveSignatureSelection(env.DB, member, "one@signature-one.example", {
      mode: "selected",
      id: disposable.id
    });
    const draft = await saveDraft(env.DB, member.id, {
      mailboxId: "mbx_signature_one",
      replyToMessageId: null,
      forwardOfMessageId: null,
      from: "one@signature-one.example",
      to: [],
      cc: [],
      bcc: [],
      subject: "Deleted source",
      text: "Saved",
      html: "<p>Saved</p>",
      signature: selected
    });
    await deleteSignature(env.DB, owner, disposable.id);

    const deletedSourceDraft = await getDraft(env.DB, member.id, draft.id);
    expect(deletedSourceDraft).toMatchObject({
      signature: {
        mode: "selected",
        id: null,
        name: "Disposable",
        text: "Saved copy"
      }
    });
    expect(deletedSourceDraft).not.toBeNull();
    if (!deletedSourceDraft) throw new Error("Deleted signature draft was not found.");
    await expect(
      resolveDraftSignature(env.DB, member, {
        from: "two@signature-two.example",
        current: {
          from: "one@signature-one.example",
          signature: deletedSourceDraft.signature
        }
      })
    ).resolves.toMatchObject({ mode: "automatic", id: secondMailbox.id });
  });

  it("enforces one scope, one default, and case-insensitive names in D1", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO email_signatures
         (id, name, html_body, text_body, user_id, mailbox_id, is_default, created_at, updated_at)
         VALUES ('sig_invalid_scope', 'Invalid', '<p>x</p>', 'x', ?, 'mbx_signature_one', 0, ?, ?)`
      )
        .bind(member.id, timestamp, timestamp)
        .run()
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        `INSERT INTO email_signatures
         (id, name, html_body, text_body, user_id, is_default, created_at, updated_at)
         VALUES ('sig_duplicate_name', 'PERSONAL', '<p>x</p>', 'x', ?, 0, ?, ?)`
      )
        .bind(member.id, timestamp, timestamp)
        .run()
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        `INSERT INTO email_signatures
         (id, name, html_body, text_body, user_id, is_default, created_at, updated_at)
         VALUES ('sig_duplicate_default', 'Other', '<p>x</p>', 'x', ?, 1, ?, ?)`
      )
        .bind(member.id, timestamp, timestamp)
        .run()
    ).rejects.toThrow();
  });
});

function userRow(user: HumanPrincipal): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO "user"
       (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
       VALUES (?, ?, ?, 1, ?, ?, ?, 0)`
  ).bind(user.id, user.name, user.email, timestamp, timestamp, user.role);
}

function grantRow(
  mailboxId: string,
  principalId: string,
  access: "agent" | "manager"
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO mailbox_grants
       (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(mailboxId, principalId, access, owner.id, timestamp, timestamp);
}
