export const mailEventTopics = ["messages", "drafts", "mailboxes"] as const;

export type MailEventTopic = (typeof mailEventTopics)[number];

export type MailEvent = {
  type: "changed";
  topic: MailEventTopic;
};

export type MailEventPublish = {
  topic: MailEventTopic;
  userIds: string[];
};

export type MailEventConnection = {
  expiresAt: number;
  topics: MailEventTopic[];
  userId: string;
};
