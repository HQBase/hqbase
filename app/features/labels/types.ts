export const labelColors = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink"
] as const;

export type LabelColor = (typeof labelColors)[number];

export type MailLabel = {
  color: LabelColor;
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
};

export type LabelMutationResult = {
  affected: number;
  assigned: boolean;
  labelId: string;
  labels: MailLabel[];
  threadId: string;
};
