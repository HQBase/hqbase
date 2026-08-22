import { extraAddresses, mailboxes } from "./local-seed-data.mjs";
import { insert, messageColumns, messageValues } from "./local-seed-sql.mjs";

export function buildCuratedMessageLinesB(timeline) {
  return [
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_community_reply",
          threadId: "thr_local_community",
          mailboxId: mailboxes[3].id,
          direction: "outbound",
          folder: "sent",
          from: mailboxes[3].address,
          to: ["community@forum.test"],
          subject: "Re: Community office hours",
          snippet: "Thanks for the invite, we will join tomorrow.",
          text: "Thanks for the invite, we will join tomorrow.",
          messageId: "<local-community-reply@example.test>",
          dedupeKey: "local-community-reply",
          inReplyTo: "<local-community-inbound@example.test>",
          references: ["<local-community-inbound@example.test>"],
          sentAt: timeline.communityReply,
          readAt: timeline.communityReply,
          sentFromAddressId: mailboxes[3].addressId
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_community_followup",
          threadId: "thr_local_community",
          mailboxId: mailboxes[3].id,
          direction: "inbound",
          folder: "inbox",
          from: "community@forum.test",
          to: [mailboxes[3].address],
          subject: "Re: Community office hours",
          snippet: "Great, see you at office hours.",
          text: "Great, see you at office hours. We will share the agenda beforehand.",
          messageId: "<local-community-followup@example.test>",
          dedupeKey: "local-community-followup",
          inReplyTo: "<local-community-reply@example.test>",
          references: [
            "<local-community-inbound@example.test>",
            "<local-community-reply@example.test>"
          ],
          receivedAt: timeline.communityFollowUp,
          deliveredToAddressId: mailboxes[3].addressId
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_vendor",
          threadId: "thr_local_vendor",
          mailboxId: mailboxes[1].id,
          direction: "inbound",
          folder: "archived",
          from: "vendor@contracts.test",
          to: [mailboxes[1].address],
          subject: "Vendor renewal",
          snippet: "Renewal is due next month. See attached terms.",
          text: "Renewal is due next month. See attached terms and let us know if you want to keep the current plan.",
          messageId: "<local-vendor@example.test>",
          dedupeKey: "local-vendor",
          receivedAt: timeline.vendorReceived,
          archivedAt: timeline.vendorArchived,
          deliveredToAddressId: mailboxes[1].addressId
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_support_thread_inbound",
          threadId: "thr_local_support_thread",
          mailboxId: mailboxes[0].id,
          direction: "inbound",
          folder: "inbox",
          from: "customer+escalation@example.test",
          to: [mailboxes[0].address],
          subject: "Support escalation",
          snippet: "Need help with login after the recent migration.",
          text: "Need help with login after the recent migration. My account is owner@hqbase.test.",
          messageId: "<local-support-thread-inbound@example.test>",
          dedupeKey: "local-support-thread-inbound",
          receivedAt: timeline.supportThreadReceived,
          deliveredToAddressId: mailboxes[0].addressId
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_support_thread_reply",
          threadId: "thr_local_support_thread",
          mailboxId: mailboxes[0].id,
          direction: "outbound",
          folder: "sent",
          from: mailboxes[0].address,
          to: ["customer+escalation@example.test"],
          subject: "Re: Support escalation",
          snippet: "We are looking into the login issue now.",
          text: "We are looking into the login issue now and will update you shortly.",
          messageId: "<local-support-thread-reply@example.test>",
          dedupeKey: "local-support-thread-reply",
          inReplyTo: "<local-support-thread-inbound@example.test>",
          references: ["<local-support-thread-inbound@example.test>"],
          sentAt: timeline.supportThreadReply,
          readAt: timeline.supportThreadReply,
          sentFromAddressId: mailboxes[0].addressId
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_support_thread_followup",
          threadId: "thr_local_support_thread",
          mailboxId: mailboxes[0].id,
          direction: "inbound",
          folder: "inbox",
          from: "customer+escalation@example.test",
          to: [mailboxes[0].address],
          subject: "Re: Support escalation",
          snippet: "Thanks, login works again.",
          text: "Thanks, login works again. Appreciate the quick fix.",
          messageId: "<local-support-thread-followup@example.test>",
          dedupeKey: "local-support-thread-followup",
          inReplyTo: "<local-support-thread-reply@example.test>",
          references: [
            "<local-support-thread-inbound@example.test>",
            "<local-support-thread-reply@example.test>"
          ],
          receivedAt: timeline.supportThreadFollowUp,
          deliveredToAddressId: mailboxes[0].addressId
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_support_thread_resolved",
          threadId: "thr_local_support_thread",
          mailboxId: mailboxes[0].id,
          direction: "outbound",
          folder: "sent",
          from: mailboxes[0].address,
          to: ["customer+escalation@example.test"],
          subject: "Re: Support escalation",
          snippet: "Glad it is resolved. Let us know if you need anything else.",
          text: "Glad it is resolved. Let us know if you need anything else.",
          messageId: "<local-support-thread-resolved@example.test>",
          dedupeKey: "local-support-thread-resolved",
          inReplyTo: "<local-support-thread-followup@example.test>",
          references: [
            "<local-support-thread-inbound@example.test>",
            "<local-support-thread-reply@example.test>",
            "<local-support-thread-followup@example.test>"
          ],
          sentAt: timeline.supportThreadResolved,
          readAt: timeline.supportThreadResolved,
          sentFromAddressId: mailboxes[0].addressId
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_billing",
          threadId: "thr_local_billing",
          mailboxId: mailboxes[4].id,
          direction: "inbound",
          folder: "inbox",
          from: "finance@vendor.test",
          to: [mailboxes[4].address],
          bcc: [mailboxes[0].address],
          subject: "Billing question",
          snippet: "Question about the latest invoice line items.",
          text: "Question about the latest invoice line items. Can you clarify the additional seat charge?",
          messageId: "<local-billing@example.test>",
          dedupeKey: "local-billing",
          receivedAt: timeline.billingReceived,
          starredAt: timeline.billingStarred,
          deliveredToAddressId: mailboxes[4].addressId
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_hello",
          threadId: "thr_local_hello",
          mailboxId: mailboxes[3].id,
          direction: "inbound",
          folder: "inbox",
          from: "marketing@launch.test",
          to: [mailboxes[3].address],
          subject: "Hello from marketing",
          snippet: "Quick hello from marketing before the launch.",
          text: "Quick hello from marketing before the launch. Let us know if you want the updated copy.",
          messageId: "<local-hello@example.test>",
          dedupeKey: "local-hello",
          receivedAt: timeline.helloReceived,
          readAt: timeline.helloRead,
          deliveredToAddressId: mailboxes[3].addressId
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_catchall",
          threadId: "thr_local_catchall",
          mailboxId: mailboxes[2].id,
          direction: "inbound",
          folder: "catchall",
          from: "random@external.test",
          to: ["unknown@ops.example.test"],
          subject: "Catchall inquiry",
          snippet: "Is this the right address for support?",
          text: "Is this the right address for support? Forwarding our request here.",
          messageId: "<local-catchall@example.test>",
          dedupeKey: "local-catchall",
          receivedAt: timeline.catchallReceived,
          deliveredToAddressId: extraAddresses[1].id
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_security",
          threadId: "thr_local_security",
          mailboxId: mailboxes[2].id,
          direction: "inbound",
          folder: "inbox",
          from: "security@audit.test",
          to: [mailboxes[2].address],
          subject: "Security review",
          snippet: "Security review findings for your review.",
          text: "Security review findings for your review. No blocking issues, but a few recommendations attached.",
          messageId: "<local-security@example.test>",
          dedupeKey: "local-security",
          receivedAt: timeline.securityReceived,
          starredAt: timeline.securityStarred,
          deliveredToAddressId: mailboxes[2].addressId
        },
        timeline.now
      )
    ),
    insert(
      "messages",
      messageColumns,
      messageValues(
        {
          id: "msg_local_welcome",
          threadId: "thr_local_welcome",
          mailboxId: mailboxes[0].id,
          direction: "inbound",
          folder: "inbox",
          from: "welcome@hqbase.test",
          to: [mailboxes[0].address],
          subject: "Welcome aboard",
          snippet: "Your HQBase workspace is ready.",
          text: "Your HQBase workspace is ready. Check the setup checklist when you are ready.",
          messageId: "<local-welcome@example.test>",
          dedupeKey: "local-welcome",
          receivedAt: timeline.welcomeReceived,
          readAt: timeline.welcomeRead,
          deliveredToAddressId: mailboxes[0].addressId
        },
        timeline.now
      )
    )
  ];
}
