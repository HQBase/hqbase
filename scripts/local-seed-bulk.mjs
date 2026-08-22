import {
  bulkBuckets,
  bulkSenders,
  bulkSubjects,
  extraAddresses,
  mailboxes
} from "./local-seed-data.mjs";
import { insert, messageColumns, messageValues } from "./local-seed-sql.mjs";

export function buildBulkSeedLines(seedDate, timeline) {
  const bulkThreads = [];
  const bulkMessages = [];
  let bulkIndex = 0;

  for (const bucket of bulkBuckets) {
    const bucketStart = seedDate.getTime() - bucket.days * 24 * 60 * 60 * 1000;
    for (let i = 0; i < bucket.count; i += 1) {
      bulkIndex += 1;
      const threadId = `thr_local_bulk_${bulkIndex.toString().padStart(4, "0")}`;
      const msgId = `msg_local_bulk_${bulkIndex.toString().padStart(4, "0")}`;
      const subject = bulkSubjects[(bulkIndex - 1) % bulkSubjects.length];
      const sender = bulkSenders[(bulkIndex - 1) % bulkSenders.length];
      const mailbox = mailboxes[(bulkIndex - 1) % mailboxes.length];
      const jitterMs = (bulkIndex % 11) * 60 * 60 * 1000 + (bulkIndex % 37) * 60 * 1000;
      const receivedAt = new Date(bucketStart + jitterMs).toISOString();
      const folder =
        bulkIndex % 20 === 0
          ? "trash"
          : bulkIndex % 15 === 0
            ? "archived"
            : bulkIndex % 30 === 0
              ? "catchall"
              : "inbox";
      const mailboxId = folder === "catchall" ? mailboxes[2].id : mailbox.id;
      const deliveredToAddressId = folder === "catchall" ? extraAddresses[1].id : mailbox.addressId;
      const starredAt = bulkIndex % 8 === 0 ? receivedAt : null;
      const readAt =
        bulkIndex % 3 === 0
          ? new Date(new Date(receivedAt).getTime() + 5 * 60 * 1000).toISOString()
          : null;
      const archivedAt =
        folder === "archived"
          ? new Date(new Date(receivedAt).getTime() + 10 * 60 * 1000).toISOString()
          : null;
      const trashedAt =
        folder === "trash"
          ? new Date(new Date(receivedAt).getTime() + 15 * 60 * 1000).toISOString()
          : null;

      bulkThreads.push(
        insert(
          "threads",
          ["id", "subject_normalized", "last_message_at", "created_at", "updated_at"],
          [threadId, subject.toLowerCase(), receivedAt, receivedAt, receivedAt]
        )
      );
      bulkMessages.push(
        insert(
          "messages",
          messageColumns,
          messageValues(
            {
              id: msgId,
              threadId,
              mailboxId,
              direction: "inbound",
              folder,
              from: sender,
              to: [mailbox.address],
              subject,
              snippet: `${subject} — bulk seed ${bucket.days}d bucket #${i + 1}`,
              text: `${subject}\n\nThis is bulk seed data for testing. Bucket: ${bucket.days} days ago, item ${i + 1} of ${bucket.count}.`,
              messageId: `<local-bulk-${bulkIndex}@example.test>`,
              dedupeKey: `local-bulk-${bulkIndex}`,
              receivedAt,
              readAt,
              starredAt,
              archivedAt,
              trashedAt,
              deliveredToAddressId
            },
            timeline.now
          )
        )
      );
    }
  }

  return [...bulkThreads, ...bulkMessages];
}
