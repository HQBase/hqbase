import { listConversations } from "./api";
import type { ConversationPage } from "./types";

/** Re-read the loaded window so removed and filtered-out rows cannot survive a refresh. */
export async function listConversationWindow(
  params: Parameters<typeof listConversations>[0],
  pages: number
): Promise<ConversationPage> {
  const first = await listConversations(params);
  const conversations = new Map(first.conversations.map((item) => [item.threadId, item]));
  let cursor = first.nextCursor;
  for (let index = 1; cursor && index < pages; index += 1) {
    const page = await listConversations({ ...params, cursor });
    for (const item of page.conversations) conversations.set(item.threadId, item);
    if (page.nextCursor === cursor) throw new Error("Conversation cursor did not advance.");
    cursor = page.nextCursor;
  }
  return {
    conversations: [...conversations.values()],
    nextCursor: cursor,
    totalCount: first.totalCount
  };
}
