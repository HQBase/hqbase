export const mailEventTopics = ["messages", "drafts", "mailboxes", "labels"] as const;

export type MailEventTopic = (typeof mailEventTopics)[number];

export type MailEventPublish = {
  topic: MailEventTopic;
  userIds: string[];
};

export type MailEventConnection = {
  expiresAt: number;
  topics: MailEventTopic[];
  userId: string;
};
