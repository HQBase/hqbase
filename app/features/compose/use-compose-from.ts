import * as React from "react";
import { toast } from "sonner";

export function useComposeFrom(
  from: string,
  setFrom: React.Dispatch<React.SetStateAction<string>>,
  saveFrom: (nextFrom: string) => Promise<unknown>
): {
  changeFrom: (nextFrom: string) => Promise<void>;
  isSignaturePending: boolean;
  setIsSignaturePending: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const [isSignaturePending, setIsSignaturePending] = React.useState(false);

  async function changeFrom(nextFrom: string): Promise<void> {
    if (nextFrom === from) return;
    setFrom(nextFrom);
    setIsSignaturePending(true);
    try {
      await saveFrom(nextFrom);
    } catch (error) {
      setFrom(from);
      toast.error(error instanceof Error ? error.message : "From address could not be changed.");
    } finally {
      setIsSignaturePending(false);
    }
  }

  return { changeFrom, isSignaturePending, setIsSignaturePending };
}
