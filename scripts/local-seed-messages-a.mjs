import { mailboxes } from "./local-seed-data.mjs";
import { insert, messageColumns, messageValues } from "./local-seed-sql.mjs";

export function buildCuratedMessageLinesA(timeline) {
  return [
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_project_inbound",
          threadId: "thr_local_project",
          mailboxId: mailboxes[0].id,
          direction: "inbound",
          folder: "inbox",
          from: "alex@customer.test",
          to: [mailboxes[0].address],
          subject: "Project update",
          snippet: "The project is on track for Friday.",
          text: "Hi team,\n\nThe project is on track for Friday. I will send the final notes tomorrow.",
          messageId: "<local-project-inbound@example.test>",
          dedupeKey: "local-project-inbound",
          receivedAt: timeline.projectReceived,
          deliveredToAddress: mailboxes[0].address
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_project_reply",
          threadId: "thr_local_project",
          mailboxId: mailboxes[0].id,
          direction: "outbound",
          folder: "sent",
          from: mailboxes[0].address,
          to: ["alex@customer.test"],
          subject: "Re: Project update",
          snippet: "Thanks, we will watch for the final notes.",
          text: "Thanks, we will watch for the final notes.",
          messageId: "<local-project-reply@example.test>",
          dedupeKey: "local-project-reply",
          inReplyTo: "<local-project-inbound@example.test>",
          references: ["<local-project-inbound@example.test>"],
          sentAt: timeline.projectReply,
          readAt: timeline.projectReply
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_invoice",
          threadId: "thr_local_invoice",
          mailboxId: mailboxes[0].id,
          direction: "inbound",
          folder: "inbox",
          from: "billing@vendor.test",
          to: [mailboxes[0].address],
          subject: "August invoice",
          snippet: "Your August invoice is ready for review.",
          text: "Your August invoice is ready for review. The due date is August 31.",
          messageId: "<local-invoice@example.test>",
          dedupeKey: "local-invoice",
          receivedAt: timeline.invoiceReceived,
          starredAt: timeline.invoiceStarred,
          deliveredToAddress: mailboxes[0].address
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_sales",
          threadId: "thr_local_sales",
          mailboxId: mailboxes[1].id,
          direction: "inbound",
          folder: "archived",
          from: "partner@business.test",
          to: [mailboxes[1].address],
          subject: "Sales follow up",
          snippet: "Following up on our conversation.",
          text: "Following up on our conversation from last week.",
          messageId: "<local-sales@example.test>",
          dedupeKey: "local-sales",
          receivedAt: timeline.salesReceived,
          readAt: timeline.salesRead,
          archivedAt: timeline.salesArchived,
          deliveredToAddress: mailboxes[1].address
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_onboarding",
          threadId: "thr_local_onboarding",
          mailboxId: mailboxes[0].id,
          direction: "inbound",
          folder: "inbox",
          from: "noreply@example.test",
          to: [mailboxes[0].address],
          cc: ["ops@ops.example.test"],
          subject: "Welcome to example.test",
          snippet: "Your workspace is ready. Here is how to get started.",
          text: "Welcome to example.test.\n\nYour workspace is ready. Verify DNS, invite your team, and connect your first mailbox.",
          messageId: "<local-onboarding@example.test>",
          dedupeKey: "local-onboarding",
          receivedAt: timeline.onboardingReceived,
          readAt: timeline.onboardingRead,
          deliveredToAddress: mailboxes[0].address
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_hiring_inbound",
          threadId: "thr_local_hiring",
          mailboxId: mailboxes[6].id,
          direction: "inbound",
          folder: "inbox",
          from: "talent@agency.test",
          to: [mailboxes[6].address],
          cc: [mailboxes[0].address],
          subject: "Hiring plan",
          snippet: "Proposed hiring plan is attached for your review.",
          text: "Hi team,\n\nProposed hiring plan is attached for your review. Let us know if the timeline works.",
          messageId: "<local-hiring-inbound@example.test>",
          dedupeKey: "local-hiring-inbound",
          receivedAt: timeline.hiringReceived,
          deliveredToAddress: mailboxes[6].address
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_hiring_reply",
          threadId: "thr_local_hiring",
          mailboxId: mailboxes[6].id,
          direction: "outbound",
          folder: "sent",
          from: mailboxes[6].address,
          to: ["talent@agency.test"],
          cc: [mailboxes[0].address],
          subject: "Re: Hiring plan",
          snippet: "Thanks, we will review the hiring plan today.",
          text: "Thanks for sending this over. We will review the hiring plan today and get back to you.",
          messageId: "<local-hiring-reply@example.test>",
          dedupeKey: "local-hiring-reply",
          inReplyTo: "<local-hiring-inbound@example.test>",
          references: ["<local-hiring-inbound@example.test>"],
          sentAt: timeline.hiringReply,
          readAt: timeline.hiringReply
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_partnership",
          threadId: "thr_local_partnership",
          mailboxId: mailboxes[1].id,
          direction: "inbound",
          folder: "inbox",
          from: "partner@business.test",
          to: [mailboxes[1].address],
          cc: [mailboxes[0].address, "founder@partner.test"],
          subject: "Partnership proposal",
          snippet: "Proposal for joint launch next quarter.",
          text: "Hello Sales team,\n\nProposal for joint launch next quarter is attached. Would love your feedback by Friday.",
          messageId: "<local-partnership@example.test>",
          dedupeKey: "local-partnership",
          receivedAt: timeline.partnershipReceived,
          starredAt: timeline.partnershipStarred,
          deliveredToAddress: mailboxes[1].address
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_outage",
          threadId: "thr_local_outage",
          mailboxId: mailboxes[2].id,
          direction: "inbound",
          folder: "inbox",
          from: "alerts@infra.test",
          to: [mailboxes[2].address],
          subject: "Ops outage window",
          snippet: "Scheduled maintenance window this weekend.",
          text: "Heads up: there is a scheduled maintenance window this weekend from 02:00 to 04:00 UTC.",
          messageId: "<local-outage@example.test>",
          dedupeKey: "local-outage",
          receivedAt: timeline.outageReceived,
          readAt: timeline.outageRead,
          deliveredToAddress: mailboxes[2].address
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_newsletter",
          threadId: "thr_local_newsletter",
          mailboxId: mailboxes[3].id,
          direction: "inbound",
          folder: "trash",
          from: "newsletter@updates.test",
          to: [mailboxes[3].address],
          subject: "Weekly newsletter",
          snippet: "This week's updates from the community.",
          text: "This week's updates from the community are ready for you.",
          messageId: "<local-newsletter@example.test>",
          dedupeKey: "local-newsletter",
          receivedAt: timeline.newsletterReceived,
          trashedAt: timeline.newsletterTrashed,
          deliveredToAddress: mailboxes[3].address
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_community_inbound",
          threadId: "thr_local_community",
          mailboxId: mailboxes[3].id,
          direction: "inbound",
          folder: "inbox",
          from: "community@forum.test",
          to: [mailboxes[3].address],
          subject: "Community office hours",
          snippet: "Join us for community office hours tomorrow.",
          text: "Join us for community office hours tomorrow at 3pm.",
          messageId: "<local-community-inbound@example.test>",
          dedupeKey: "local-community-inbound",
          receivedAt: timeline.communityReceived,
          deliveredToAddress: mailboxes[3].address
        },
        timeline.now
      )
    )
  ];
}
