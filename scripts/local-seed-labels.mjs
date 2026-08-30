import { owner } from "./local-seed-data.mjs";
import { insert } from "./local-seed-sql.mjs";

const labels = [
  ["lbl_local_billing", "Billing", "green"],
  ["lbl_local_community", "Community", "gray"],
  ["lbl_local_customer", "Customer", "blue"],
  ["lbl_local_follow_up", "Follow up", "amber"],
  ["lbl_local_hiring", "Hiring", "pink"],
  ["lbl_local_operations", "Operations", "orange"],
  ["lbl_local_partners", "Partners", "teal"],
  ["lbl_local_priority", "Priority", "red"],
  ["lbl_local_product", "Product", "indigo"],
  ["lbl_local_sales", "Sales", "purple"],
  ["lbl_local_security", "Security", "red"]
];

const messageRules = [
  [
    "lbl_local_billing",
    "subject LIKE '%billing%' OR subject LIKE '%charge%' OR subject LIKE '%invoice%' OR subject LIKE '%refund%'"
  ],
  ["lbl_local_community", "subject LIKE '%community%' OR subject LIKE '%newsletter%'"],
  [
    "lbl_local_customer",
    "subject LIKE '%customer%' OR subject LIKE '%onboarding%' OR subject LIKE '%project update%' OR subject LIKE '%support%' OR subject LIKE '%welcome%'"
  ],
  [
    "lbl_local_follow_up",
    "subject LIKE '%catchall%' OR subject LIKE '%follow-up%' OR subject LIKE '%follow up%' OR subject LIKE '%project update%' OR subject LIKE '%refund%'"
  ],
  ["lbl_local_hiring", "subject LIKE '%hiring%'"],
  [
    "lbl_local_operations",
    "subject LIKE '%incident%' OR subject LIKE '%ops%' OR subject LIKE '%status report%' OR subject LIKE '%vendor%'"
  ],
  ["lbl_local_partners", "subject LIKE '%partnership%'"],
  [
    "lbl_local_priority",
    "subject LIKE '%500s%' OR subject LIKE '%crash%' OR subject LIKE '%incident%' OR subject LIKE '%outage%' OR subject LIKE '%security%' OR subject LIKE '%support%'"
  ],
  [
    "lbl_local_product",
    "subject LIKE '%design review%' OR subject LIKE '%feature request%' OR subject LIKE '%product roadmap%' OR subject LIKE '%quarterly planning%'"
  ],
  ["lbl_local_sales", "subject LIKE '%marketing%' OR subject LIKE '%sales%'"],
  ["lbl_local_security", "subject LIKE '%security%'"],
  [
    "lbl_local_product",
    "id LIKE 'msg_local_bulk_%' AND NOT EXISTS (SELECT 1 FROM message_labels assigned WHERE assigned.message_id = messages.id)"
  ]
];

const draftAssignments = [
  ["drf_local_followup", "lbl_local_customer"],
  ["drf_local_followup", "lbl_local_follow_up"],
  ["drf_local_forward", "lbl_local_partners"],
  ["drf_local_hiring_reply", "lbl_local_hiring"],
  ["drf_local_proposal", "lbl_local_partners"],
  ["drf_local_clara_invoice", "lbl_local_billing"],
  ["drf_local_clara_invoice", "lbl_local_follow_up"],
  ["drf_local_clara_login", "lbl_local_customer"],
  ["drf_local_clara_login", "lbl_local_priority"],
  ["drf_local_clara_onboarding", "lbl_local_customer"],
  ["drf_local_clara_refund", "lbl_local_billing"],
  ["drf_local_clara_refund", "lbl_local_follow_up"]
];

export function buildLabelSeedLines(timeline) {
  const lines = labels.map(([id, name, color]) =>
    insert(
      "labels",
      ["id", "name", "color", "created_by_user_id", "created_at", "updated_at"],
      [id, name, color, owner.id, timeline.workspaceCreated, timeline.now]
    )
  );

  for (const [labelId, predicate] of messageRules) {
    lines.push(
      `INSERT OR IGNORE INTO "message_labels" ("message_id", "label_id", "assigned_by_principal_id", "created_at") SELECT "id", '${labelId}', '${owner.id}', "created_at" FROM "messages" WHERE ${predicate};`
    );
  }

  for (const [draftId, labelId] of draftAssignments) {
    lines.push(
      `INSERT OR IGNORE INTO "draft_labels" ("draft_id", "label_id", "assigned_by_principal_id", "created_at") SELECT "id", '${labelId}', '${owner.id}', '${timeline.now}' FROM "drafts" WHERE "id" = '${draftId}';`
    );
  }

  return lines;
}
