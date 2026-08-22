import { insert } from "./local-seed-sql.mjs";

export function buildThreadSeedLines(timeline) {
  return [
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_project",
        "project update",
        timeline.projectReply,
        timeline.projectReceived,
        timeline.projectReply
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_invoice",
        "august invoice",
        timeline.invoiceReceived,
        timeline.invoiceReceived,
        timeline.invoiceReceived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_sales",
        "sales follow up",
        timeline.salesReceived,
        timeline.salesReceived,
        timeline.salesArchived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_onboarding",
        "welcome to example.test",
        timeline.onboardingReceived,
        timeline.onboardingReceived,
        timeline.onboardingReceived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_hiring",
        "hiring plan",
        timeline.hiringReply,
        timeline.hiringReceived,
        timeline.hiringReply
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_partnership",
        "partnership proposal",
        timeline.partnershipReceived,
        timeline.partnershipReceived,
        timeline.partnershipReceived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_outage",
        "ops outage window",
        timeline.outageReceived,
        timeline.outageReceived,
        timeline.outageReceived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_newsletter",
        "weekly newsletter",
        timeline.newsletterReceived,
        timeline.newsletterReceived,
        timeline.newsletterReceived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_community",
        "community office hours",
        timeline.communityFollowUp,
        timeline.communityReceived,
        timeline.communityFollowUp
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_vendor",
        "vendor renewal",
        timeline.vendorReceived,
        timeline.vendorReceived,
        timeline.vendorArchived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_support_thread",
        "support escalation",
        timeline.supportThreadResolved,
        timeline.supportThreadReceived,
        timeline.supportThreadResolved
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_billing",
        "billing question",
        timeline.billingReceived,
        timeline.billingReceived,
        timeline.billingReceived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_hello",
        "hello from marketing",
        timeline.helloReceived,
        timeline.helloReceived,
        timeline.helloReceived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_catchall",
        "catchall inquiry",
        timeline.catchallReceived,
        timeline.catchallReceived,
        timeline.catchallReceived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_security",
        "security review",
        timeline.securityReceived,
        timeline.securityReceived,
        timeline.securityReceived
      ]
    ),
    insert(
      "threads",
      ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
      [
        "thr_local_welcome",
        "welcome aboard",
        timeline.welcomeReceived,
        timeline.welcomeReceived,
        timeline.welcomeReceived
      ]
    )
  ];
}
