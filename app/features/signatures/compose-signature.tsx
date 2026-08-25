import * as React from "react";
import { toast } from "sonner";

import { DropdownSelect, type DropdownSelectOption } from "@/components/ui/dropdown-select";
import { buildEmailHtmlDocument } from "@/features/messages/html-document";
import { EmailFrame } from "@/features/messages/message-html";
import { useTheme } from "@/features/theme/theme-provider";
import { listUsableSignatures } from "./api";
import type {
  Signature,
  SignatureCandidates,
  SignatureSelection,
  SignatureSnapshot
} from "./types";

const emptyCandidates: SignatureCandidates = {
  automaticSignatureId: null,
  signatures: []
};

export function ComposeSignature({
  disabled = false,
  from,
  signature,
  onManage,
  onSelectionChange
}: {
  disabled?: boolean;
  from: string;
  signature: SignatureSnapshot;
  onManage: () => void;
  onSelectionChange: (selection: SignatureSelection) => Promise<void> | void;
}): React.ReactElement {
  const [candidates, setCandidates] = React.useState(emptyCandidates);
  const [loading, setLoading] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!from) {
      setCandidates(emptyCandidates);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void listUsableSignatures(from)
      .then((result) => {
        if (active) setCandidates(result);
      })
      .catch((reason: unknown) => {
        if (active) {
          setCandidates(emptyCandidates);
          setError(reason instanceof Error ? reason.message : "Signatures could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [from]);

  const value = signatureValue(signature);
  const options = signatureOptions(candidates.signatures, signature);

  async function select(nextValue: string): Promise<void> {
    if (nextValue === "manage") {
      onManage();
      return;
    }
    const selection = selectionFromValue(nextValue);
    if (!selection) return;
    setPending(true);
    try {
      await onSelectionChange(selection);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Signature could not be changed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="px-5 pb-3">
      <SignaturePreview signature={signature} />
      <div className="mt-1.5 flex max-w-full items-center gap-2">
        <span className="text-xs text-muted-foreground">Signature</span>
        <DropdownSelect
          ariaLabel="Signature"
          className="h-11 min-h-11 w-auto max-w-full border-0 bg-transparent px-2 shadow-none [@media(hover:hover)]:hover:bg-muted/60 sm:h-9 sm:min-h-9"
          disabled={disabled || pending || loading}
          options={options}
          value={value}
          onValueChange={(nextValue) => void select(nextValue)}
        />
      </div>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SignaturePreview({
  signature
}: {
  signature: SignatureSnapshot;
}): React.ReactElement | null {
  const { theme } = useTheme();
  if (!signature.text.trim()) return null;
  return signature.html ? (
    <EmailFrame
      srcDoc={buildEmailHtmlDocument({
        allowRemoteImages: false,
        html: signature.html,
        origin: window.location.origin,
        theme
      })}
      title="Signature preview"
    />
  ) : (
    <section
      className="whitespace-pre-line text-sm text-muted-foreground"
      aria-label="Signature preview"
    >
      {signature.text}
    </section>
  );
}

function signatureOptions(
  signatures: Signature[],
  current: SignatureSnapshot
): DropdownSelectOption[] {
  const options: DropdownSelectOption[] = [
    ...signatures.map((signature) => ({
      label: `${signature.name} · ${scopeName(signature)}`,
      value: `selected:${signature.id}`
    }))
  ];
  if (
    current.mode !== "none" &&
    current.name &&
    !signatures.some((signature) => signature.id === current.id)
  ) {
    options.push({
      disabled: true,
      label: `${current.name} · Saved copy`,
      value: current.id ? `selected:${current.id}` : "snapshot"
    });
  }
  options.push(
    { label: "No signature", value: "none" },
    { label: "Manage signatures…", value: "manage" }
  );
  return options;
}

function signatureValue(signature: SignatureSnapshot): string {
  if (signature.mode === "none") return "none";
  if (signature.id) return `selected:${signature.id}`;
  return signature.name ? "snapshot" : "none";
}

function selectionFromValue(value: string): SignatureSelection | null {
  if (value === "none") return { mode: "none" };
  if (value.startsWith("selected:") && value.length > "selected:".length) {
    return { mode: "selected", id: value.slice("selected:".length) };
  }
  return null;
}

function scopeName(signature: Signature): string {
  if (signature.scope === "user") return "Personal";
  if (signature.scope === "domain") return `Domain ${signature.scopeLabel}`;
  return signature.scopeLabel;
}
