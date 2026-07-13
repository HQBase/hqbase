import type { MessageSummary } from "@/features/messages/types";
import { apiPost } from "@/lib/api-client";

export async function sendMessage(input: {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<MessageSummary> {
  return apiPost<MessageSummary>("/api/send", input);
}

export async function replyToMessage(input: {
  messageId: string;
  from: string;
  text: string;
  html?: string;
}): Promise<MessageSummary> {
  return apiPost<MessageSummary>("/api/reply", input);
}
