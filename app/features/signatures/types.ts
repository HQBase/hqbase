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

export type SignatureScopeTarget = {
  type: SignatureScope;
  id: string;
};

export type SignatureCandidates = {
  automaticSignatureId: string | null;
  signatures: Signature[];
};

export type SignatureInput = {
  name: string;
  html: string;
  scope: SignatureScopeTarget;
  isDefault: boolean;
};
