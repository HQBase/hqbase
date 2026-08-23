import { domain, domains, mailboxes, owner, seedVersion, users } from "./local-seed-data.mjs";
import { upsert } from "./local-seed-sql.mjs";

export function buildWorkspaceSeedLines(passwordHash, timeline) {
  const lines = [];

  for (const user of users) {
    lines.push(
      upsert(
        '"user"',
        ["id", "name", "email", "emailVerified", "createdAt", "updatedAt", "role", "banned"],
        [user.id, user.name, user.email, 1, timeline.workspaceCreated, timeline.now, user.role, 0],
        ["id"],
        ["name", "email", "emailVerified", "updatedAt", "role", "banned"]
      )
    );
  }

  lines.push(
    upsert(
      "account",
      [
        "id",
        "issuer",
        "providerAccountId",
        "providerId",
        "userId",
        "password",
        "createdAt",
        "updatedAt"
      ],
      [
        "acc_local_owner",
        "local:credential",
        owner.id,
        "credential",
        owner.id,
        passwordHash,
        timeline.workspaceCreated,
        timeline.now
      ],
      ["id"],
      ["password", "updatedAt"]
    )
  );

  for (const entry of domains) {
    lines.push(
      upsert(
        "mail_domains",
        [
          "id",
          "name",
          "receiving_status",
          "sending_status",
          "dns_status",
          "catch_all_policy",
          "catch_all_mailbox_id",
          "is_enabled",
          "verified_at",
          "created_at",
          "updated_at"
        ],
        [
          entry.id,
          entry.name,
          "ready",
          "ready",
          "ready",
          entry.catchAllPolicy,
          null,
          1,
          timeline.workspaceCreated,
          timeline.workspaceCreated,
          timeline.now
        ],
        ["id"],
        [
          "name",
          "receiving_status",
          "sending_status",
          "dns_status",
          "catch_all_policy",
          "is_enabled",
          "verified_at",
          "updated_at"
        ]
      )
    );
  }

  for (const mailbox of mailboxes) {
    lines.push(
      upsert(
        "mailboxes",
        [
          "id",
          "address",
          "mail_domain_id",
          "display_name",
          "is_active",
          "created_at",
          "updated_at"
        ],
        [
          mailbox.id,
          mailbox.address,
          mailbox.domainId,
          mailbox.displayName,
          1,
          timeline.workspaceCreated,
          timeline.now
        ],
        ["id"],
        ["address", "mail_domain_id", "display_name", "is_active", "updated_at"]
      )
    );
  }

  lines.push(
    upsert(
      "mail_domains",
      [
        "id",
        "name",
        "receiving_status",
        "sending_status",
        "dns_status",
        "catch_all_policy",
        "catch_all_mailbox_id",
        "is_enabled",
        "verified_at",
        "created_at",
        "updated_at"
      ],
      [
        domains[1].id,
        domains[1].name,
        "ready",
        "ready",
        "ready",
        domains[1].catchAllPolicy,
        mailboxes[2].id,
        1,
        timeline.workspaceCreated,
        timeline.workspaceCreated,
        timeline.now
      ],
      ["id"],
      ["catch_all_mailbox_id", "updated_at"]
    )
  );

  lines.push(
    upsert(
      "mailbox_grants",
      ["mailbox_id", "user_id", "access_level", "created_by", "created_at", "updated_at"],
      [mailboxes[1].id, owner.id, "manager", owner.id, timeline.workspaceCreated, timeline.now],
      ["mailbox_id", "user_id"],
      ["access_level", "updated_at"]
    ),
    upsert(
      "mailbox_grants",
      ["mailbox_id", "user_id", "access_level", "created_by", "created_at", "updated_at"],
      [mailboxes[0].id, users[1].id, "manager", owner.id, timeline.workspaceCreated, timeline.now],
      ["mailbox_id", "user_id"],
      ["access_level", "updated_at"]
    ),
    upsert(
      "mailbox_grants",
      ["mailbox_id", "user_id", "access_level", "created_by", "created_at", "updated_at"],
      [mailboxes[2].id, users[1].id, "agent", owner.id, timeline.workspaceCreated, timeline.now],
      ["mailbox_id", "user_id"],
      ["access_level", "updated_at"]
    ),
    upsert(
      "mailbox_grants",
      ["mailbox_id", "user_id", "access_level", "created_by", "created_at", "updated_at"],
      [mailboxes[0].id, users[2].id, "agent", owner.id, timeline.workspaceCreated, timeline.now],
      ["mailbox_id", "user_id"],
      ["access_level", "updated_at"]
    ),
    upsert(
      "mailbox_grants",
      ["mailbox_id", "user_id", "access_level", "created_by", "created_at", "updated_at"],
      [mailboxes[3].id, users[3].id, "read", owner.id, timeline.workspaceCreated, timeline.now],
      ["mailbox_id", "user_id"],
      ["access_level", "updated_at"]
    ),
    upsert(
      "mailbox_grants",
      ["mailbox_id", "user_id", "access_level", "created_by", "created_at", "updated_at"],
      [mailboxes[4].id, owner.id, "manager", owner.id, timeline.workspaceCreated, timeline.now],
      ["mailbox_id", "user_id"],
      ["access_level", "updated_at"]
    ),
    upsert(
      "mailbox_grants",
      ["mailbox_id", "user_id", "access_level", "created_by", "created_at", "updated_at"],
      [mailboxes[6].id, users[1].id, "manager", owner.id, timeline.workspaceCreated, timeline.now],
      ["mailbox_id", "user_id"],
      ["access_level", "updated_at"]
    ),
    upsert(
      "mailbox_grants",
      ["mailbox_id", "user_id", "access_level", "created_by", "created_at", "updated_at"],
      [mailboxes[6].id, users[2].id, "agent", owner.id, timeline.workspaceCreated, timeline.now],
      ["mailbox_id", "user_id"],
      ["access_level", "updated_at"]
    ),
    upsert(
      "mailbox_grants",
      ["mailbox_id", "user_id", "access_level", "created_by", "created_at", "updated_at"],
      [mailboxes[7].id, users[1].id, "agent", owner.id, timeline.workspaceCreated, timeline.now],
      ["mailbox_id", "user_id"],
      ["access_level", "updated_at"]
    ),
    upsert(
      "user_mail_preferences",
      ["user_id", "default_from_mailbox_id", "created_at", "updated_at"],
      [owner.id, mailboxes[0].id, timeline.workspaceCreated, timeline.now],
      ["user_id"],
      ["default_from_mailbox_id", "updated_at"]
    ),
    upsert(
      "user_mail_preferences",
      ["user_id", "default_from_mailbox_id", "created_at", "updated_at"],
      [users[1].id, mailboxes[2].id, timeline.workspaceCreated, timeline.now],
      ["user_id"],
      ["default_from_mailbox_id", "updated_at"]
    ),
    upsert(
      "app_settings",
      ["key", "value_json", "created_at", "updated_at"],
      ["primary_domain", JSON.stringify(domain.name), timeline.workspaceCreated, timeline.now],
      ["key"],
      ["value_json", "updated_at"]
    ),
    upsert(
      "app_settings",
      ["key", "value_json", "created_at", "updated_at"],
      ["setup_complete", JSON.stringify(true), timeline.workspaceCreated, timeline.now],
      ["key"],
      ["value_json", "updated_at"]
    ),
    upsert(
      "app_settings",
      ["key", "value_json", "created_at", "updated_at"],
      [
        "setup_checklist_acknowledged",
        JSON.stringify(true),
        timeline.workspaceCreated,
        timeline.now
      ],
      ["key"],
      ["value_json", "updated_at"]
    ),
    upsert(
      "app_settings",
      ["key", "value_json", "created_at", "updated_at"],
      ["local_seed_version", JSON.stringify(seedVersion), timeline.workspaceCreated, timeline.now],
      ["key"],
      ["value_json", "updated_at"]
    )
  );

  return lines;
}
