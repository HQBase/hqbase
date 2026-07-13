import type { ToasterProps } from "sonner";
import { Toaster as Sonner } from "sonner";

export function Toaster(props: ToasterProps) {
  return <Sonner closeButton richColors theme="light" {...props} />;
}
