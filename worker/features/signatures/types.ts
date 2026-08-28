export type SignatureMode = "automatic" | "selected" | "none";
export type SignatureScope = "user" | "mailbox" | "domain";

export type SignatureSelection =
  | { mode: "automatic" }
  | { mode: "selected"; id: string }
  | { mode: "none" };

export type SignatureSnapshot = {
  mode: SignatureMode;
  id: string | null;
  name: string;
  html: string;
  text: string;
};

export type Signature = {
  id: string;
  name: string;
  html: string;
  text: string;
  scope: SignatureScope;
  scopeId: string;
  scopeLabel: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SignatureRow = {
  id: string;
  name: string;
  html_body: string;
  text_body: string;
  user_id: string | null;
  mailbox_id: string | null;
  mail_domain_id: string | null;
  is_default: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  mailbox_address?: string | null;
  mailbox_display_name?: string | null;
  domain_name?: string | null;
};

export type SignatureScopeTarget =
  | { type: "user"; id: string }
  | { type: "mailbox"; id: string }
  | { type: "domain"; id: string };
