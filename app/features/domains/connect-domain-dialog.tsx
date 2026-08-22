import * as React from "react";
import { PiPlus } from "react-icons/pi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { CloudflareAuthorizationFlow } from "@/features/settings/cloudflare-authorization-dialog";
import type { CloudflareZone } from "@/features/setup/types";
import { listAvailableCloudflareZones, provisionDomain } from "./api";
import type { MailDomain } from "./types";

export function ConnectDomainDialog({
  authorized,
  domains,
  open,
  onAuthorize,
  onConnected,
  onOpenChange
}: {
  authorized: boolean;
  domains: MailDomain[];
  open: boolean;
  onAuthorize: () => void;
  onConnected: () => void;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const [zones, setZones] = React.useState<CloudflareZone[]>([]);
  const [zoneId, setZoneId] = React.useState("");
  const [name, setName] = React.useState("");
  const [enableSending, setEnableSending] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  const loadZones = React.useCallback(async () => {
    try {
      const next = (await listAvailableCloudflareZones()).filter(
        (zone) => zone.status === "active"
      );
      setZones(next);
      const migrated = domains.find((domain) => !domain.zoneId);
      const selected = next.find((zone) => zone.name === migrated?.name) ?? next[0];
      if (selected) {
        setZoneId(selected.id);
        setName(selected.name);
      }
      toast.success(
        `${next.length} active Cloudflare domain${next.length === 1 ? "" : "s"} loaded.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Cloudflare domains could not be loaded."
      );
    }
  }, [domains]);

  React.useEffect(() => {
    if (open && authorized && zones.length === 0) void loadZones();
  }, [authorized, loadZones, open, zones.length]);

  function chooseZone(id: string, source = zones) {
    const selected = source.find((zone) => zone.id === id);
    setZoneId(id);
    setName(selected?.name ?? "");
  }

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      await provisionDomain({ zoneId, name, enableSending });
      reset();
      onConnected();
      toast.success("Domain connected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Domain setup failed.");
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setName("");
    setEnableSending(true);
    setZoneId("");
    setZones([]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <PiPlus data-icon="inline-start" />
          Connect domain
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(92vw,520px)]">
        <DialogHeader>
          <DialogTitle>Connect domain</DialogTitle>
          <DialogDescription>
            Load an active Cloudflare zone, then connect it to HQBase.
          </DialogDescription>
        </DialogHeader>
        {authorized ? (
          <form className="flex flex-col gap-5" onSubmit={(event) => void connect(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel>Cloudflare domain</FieldLabel>
                <Select required value={zoneId} onValueChange={chooseZone}>
                  <SelectTrigger aria-label="Cloudflare domain">
                    <SelectValue placeholder="Choose an active domain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {zones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="grid grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-1">
                <Checkbox
                  checked={enableSending}
                  id="connect-domain-enable-sending"
                  onCheckedChange={(checked) => setEnableSending(checked === true)}
                />
                <div className="grid gap-1 leading-none">
                  <FieldLabel htmlFor="connect-domain-enable-sending">
                    Enable outbound sending
                  </FieldLabel>
                  <FieldDescription>
                    Requires Workers Paid. Clear this option for receive-only mail.
                  </FieldDescription>
                </div>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={pending || !name || !zoneId} type="submit">
                {pending ? "Connecting domain…" : "Connect domain"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <CloudflareAuthorizationFlow
            active={open}
            authorizeHref="/api/domains/cloudflare/oauth/start"
            description="Cloudflare will ask you to approve temporary access for this domain connection."
            layout="inline"
            onAuthorize={onAuthorize}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
