import { sql } from "drizzle-orm";

import { createAgentCredential } from "../../auth/agent-credential";
import { newId, nowIso } from "../../db/client";
import { getRow } from "../../db/drizzle";
import { AppError } from "../../lib/errors";
import { auditStatement } from "../audit/service";
import { credentialResource, scopesForMailboxAccess } from "./credential-service";
import { findAgentById } from "./queries";
import type {
  Agent,
  AgentMutationResult,
  CreateAgentInput,
  CreateMailboxAgentInput
} from "./types";

type MailDomainRow = {
  id: string;
  name: string;
  is_enabled: number;
};

type MailboxRow = {
  id: string;
  address: string;
  display_name: string;
  is_active: number;
  mail_domain_id: string;
  domain_name: string;
  domain_enabled: number;
};

type ProvisionerRow = {
  principal_id: string;
  status: "active" | "disabled";
  profile: "mailbox" | "provisioner";
  mail_domain_id: string;
  mailbox_limit: number | null;
  mailbox_count: number;
  domain_name: string;
  domain_enabled: number;
};

type MailboxInsert = {
  id: string;
  addressId: string;
  address: string;
  displayName: string;
  mailDomainId: string;
};
export async function createAgentForHuman(
  db: D1Database,
  input: CreateAgentInput,
  actorPrincipalId: string,
  correlationId: string
): Promise<AgentMutationResult> {
  if (input.profile === "provisioner") {
    const domain = await requireEnabledDomain(db, input.mailDomainId);
    return insertAgent(db, {
      actorPrincipalId,
      actorType: "user",
      correlationId,
      input,
      mailDomainId: domain.id
    });
  }

  if ("id" in input.mailbox) {
    const mailbox = await requireActiveMailbox(db, input.mailbox.id);
    return insertAgent(db, {
      actorPrincipalId,
      actorType: "user",
      correlationId,
      input,
      mailDomainId: mailbox.mail_domain_id,
      mailboxId: mailbox.id
    });
  }

  const domain = await requireEnabledAddressDomain(db, input.mailbox.address);
  return insertAgent(db, {
    actorPrincipalId,
    actorType: "user",
    correlationId,
    input,
    mailDomainId: domain.id,
    mailbox: newMailboxInsert(input, domain.id)
  });
}
export async function createAgentForProvisioner(
  db: D1Database,
  input: CreateMailboxAgentInput,
  provisionerPrincipalId: string,
  correlationId: string
): Promise<AgentMutationResult> {
  if ("id" in input.mailbox) {
    throw new AppError(
      "PROVISIONER_MAILBOX_REQUIRED",
      "A provisioner must create a new mailbox for each mailbox agent.",
      400
    );
  }

  const provisioner = await requireActiveProvisioner(db, provisionerPrincipalId);
  if (provisioner.domain_enabled !== 1) {
    throw new AppError("DOMAIN_NOT_REGISTERED", "The provisioner's email domain is disabled.", 409);
  }
  if (provisioner.mailbox_count >= (provisioner.mailbox_limit ?? 0)) {
    throw new AppError(
      "PROVISIONER_LIMIT_REACHED",
      "This provisioner has reached its mailbox limit.",
      409
    );
  }
  if (addressDomain(input.mailbox.address) !== provisioner.domain_name) {
    throw new AppError(
      "PROVISIONER_DOMAIN_MISMATCH",
      `Mailbox address must use ${provisioner.domain_name}.`,
      400
    );
  }

  return insertAgent(db, {
    actorPrincipalId: provisionerPrincipalId,
    actorType: "agent",
    correlationId,
    input,
    mailDomainId: provisioner.mail_domain_id,
    mailbox: newMailboxInsert(input, provisioner.mail_domain_id)
  });
}
async function insertAgent(
  db: D1Database,
  options: {
    actorPrincipalId: string;
    actorType: "user" | "agent";
    correlationId: string;
    input: CreateAgentInput;
    mailDomainId: string;
    mailboxId?: string;
    mailbox?: MailboxInsert;
  }
): Promise<AgentMutationResult> {
  const timestamp = nowIso();
  const principalId = newId("agt");
  const credentialId = newId("cred");
  const resource = credentialResource(options.input.profile);
  const credentialScopes =
    options.input.profile === "provisioner"
      ? ["mailbox:provision"]
      : scopesForMailboxAccess(options.input.accessLevel);
  const issued = await createAgentCredential();
  const mailboxId = options.mailbox?.id ?? options.mailboxId;

  const statements: D1PreparedStatement[] = [];
  if (options.mailbox) {
    statements.push(
      db
        .prepare(
          `INSERT INTO mailboxes
           (id, address, display_name, kind, is_active, created_at, updated_at)
           VALUES (?, ?, ?, 'agent', 1, ?, ?)`
        )
        .bind(
          options.mailbox.id,
          options.mailbox.address,
          options.mailbox.displayName,
          timestamp,
          timestamp
        ),
      db
        .prepare(
          `INSERT INTO mailbox_addresses
           (id, mailbox_id, mail_domain_id, local_part, address, display_name,
            receive_enabled, send_enabled, is_primary, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?)`
        )
        .bind(
          options.mailbox.addressId,
          options.mailbox.id,
          options.mailbox.mailDomainId,
          options.mailbox.address.split("@")[0] ?? options.mailbox.address,
          options.mailbox.address,
          options.mailbox.displayName,
          timestamp,
          timestamp
        )
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO principals (id, type, name, status, created_at, updated_at)
         VALUES (?, 'agent', ?, 'active', ?, ?)`
      )
      .bind(principalId, options.input.name, timestamp, timestamp),
    db
      .prepare(
        `INSERT INTO agents
         (principal_id, profile, created_by_principal_id, mail_domain_id, mailbox_limit,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        principalId,
        options.input.profile,
        options.actorPrincipalId,
        options.mailDomainId,
        options.input.profile === "provisioner" ? options.input.mailboxLimit : null,
        timestamp,
        timestamp
      ),
    auditStatement(
      db,
      {
        correlationId: options.correlationId,
        actorType: options.actorType,
        actorId: options.actorPrincipalId,
        action: "agent.create",
        resourceType: "agent",
        resourceId: principalId,
        outcome: "success",
        metadata: { profile: options.input.profile }
      },
      timestamp
    )
  );

  if (options.input.profile === "mailbox" && mailboxId) {
    statements.push(
      db
        .prepare(
          `INSERT INTO mailbox_grants
           (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          mailboxId,
          principalId,
          options.input.accessLevel,
          options.actorPrincipalId,
          timestamp,
          timestamp
        )
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO agent_credentials
         (id, principal_id, secret_hash, resource, scopes_json, created_at,
          expires_at, revoked_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`
      )
      .bind(
        credentialId,
        principalId,
        issued.secretHash,
        resource,
        JSON.stringify(credentialScopes),
        timestamp
      )
  );

  try {
    await db.batch(statements);
  } catch (error) {
    throw provisioningError(error);
  }

  return { agent: await requiredAgent(db, principalId), credential: issued.token };
}

async function requireEnabledDomain(db: D1Database, id: string): Promise<MailDomainRow> {
  const domain = await getRow<MailDomainRow>(
    db,
    sql`SELECT id, name, is_enabled FROM mail_domains WHERE id = ${id}`
  );
  if (!domain) throw new AppError("DOMAIN_NOT_FOUND", "Email domain not found.", 404);
  if (domain.is_enabled !== 1) {
    throw new AppError("DOMAIN_NOT_REGISTERED", "Enable the email domain first.", 409);
  }
  return domain;
}

async function requireEnabledAddressDomain(
  db: D1Database,
  address: string
): Promise<MailDomainRow> {
  const name = addressDomain(address);
  const domain = await getRow<MailDomainRow>(
    db,
    sql`SELECT id, name, is_enabled FROM mail_domains WHERE name = ${name}`
  );
  if (domain?.is_enabled !== 1) {
    throw new AppError("DOMAIN_NOT_REGISTERED", "Add and enable the email domain first.", 400);
  }
  return domain;
}

async function requireActiveMailbox(db: D1Database, id: string): Promise<MailboxRow> {
  const mailbox = await getRow<MailboxRow>(
    db,
    sql`SELECT m.id, m.address, m.display_name, m.is_active,
               a.mail_domain_id, d.name AS domain_name, d.is_enabled AS domain_enabled
        FROM mailboxes m
        JOIN mailbox_addresses a ON a.mailbox_id = m.id AND a.is_primary = 1
        JOIN mail_domains d ON d.id = a.mail_domain_id
        WHERE m.id = ${id}`
  );
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Mailbox not found.", 404);
  if (mailbox.is_active !== 1 || mailbox.domain_enabled !== 1) {
    throw new AppError("MAILBOX_DISABLED", "Choose an active mailbox on an enabled domain.", 409);
  }
  return mailbox;
}

async function requireActiveProvisioner(
  db: D1Database,
  principalId: string
): Promise<ProvisionerRow> {
  const row = await getRow<ProvisionerRow>(
    db,
    sql`SELECT a.principal_id, p.status, a.profile, a.mail_domain_id, a.mailbox_limit,
               d.name AS domain_name, d.is_enabled AS domain_enabled,
               (SELECT COUNT(*) FROM agents child
                WHERE child.created_by_principal_id = a.principal_id) AS mailbox_count
        FROM agents a
        JOIN principals p ON p.id = a.principal_id
        JOIN mail_domains d ON d.id = a.mail_domain_id
        WHERE a.principal_id = ${principalId}`
  );
  if (row?.status !== "active" || row.profile !== "provisioner") {
    throw new AppError("PROVISIONER_FORBIDDEN", "Provisioner credential is not active.", 403);
  }
  return row;
}

function newMailboxInsert(input: CreateMailboxAgentInput, mailDomainId: string): MailboxInsert {
  if ("id" in input.mailbox) {
    throw new AppError("MAILBOX_REQUIRED", "A new mailbox address is required.", 400);
  }
  return {
    id: newId("mbx"),
    addressId: newId("addr"),
    address: input.mailbox.address,
    displayName: input.mailbox.displayName,
    mailDomainId
  };
}

function addressDomain(address: string): string {
  return address.split("@")[1]?.toLowerCase() ?? "";
}

async function requiredAgent(db: D1Database, id: string): Promise<Agent> {
  const agent = await findAgentById(db, id);
  if (!agent) throw new Error("Agent write did not persist.");
  return agent;
}

function provisioningError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("UNIQUE constraint failed: mailboxes.address") ||
    message.includes("UNIQUE constraint failed: mailbox_addresses")
  ) {
    return new AppError("MAILBOX_EXISTS", "A mailbox with this address already exists.", 409);
  }
  if (message.includes("AGENT_MAILBOX_LIMIT_REACHED")) {
    return new AppError(
      "PROVISIONER_LIMIT_REACHED",
      "This provisioner has reached its mailbox limit.",
      409
    );
  }
  if (message.includes("AGENT_DOMAIN_FORBIDDEN")) {
    return new AppError(
      "PROVISIONER_DOMAIN_MISMATCH",
      "Mailbox address does not use the provisioner's approved domain.",
      409
    );
  }
  if (
    message.includes("AGENT_PROVISIONER_REQUIRED") ||
    message.includes("AGENT_PROVISIONER_DISABLED") ||
    message.includes("AGENT_CHILD_PROFILE_FORBIDDEN")
  ) {
    return new AppError(
      "PROVISIONER_FORBIDDEN",
      "Provisioner credential cannot create this agent.",
      403
    );
  }
  return error instanceof Error ? error : new Error(message);
}
