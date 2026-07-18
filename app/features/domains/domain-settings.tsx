import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { listCloudflareZones } from "@/features/setup/api";
import type { CloudflareZone } from "@/features/setup/types";
import {
  changePortal,
  changeServiceOrigin,
  listDomains,
  provisionDomain,
  updateDomain
} from "./api";
import type { MailDomain } from "./types";
export function DomainSettings({
  portalHostname,
  serviceHostname,
  onChanged
}: {
  portalHostname: string | null;
  serviceHostname: string | null;
  onChanged: () => void;
}) {
  const [domains, setDomains] = React.useState<MailDomain[]>([]);
  const [zones, setZones] = React.useState<CloudflareZone[]>([]);
  const [token, setToken] = React.useState("");
  const [zoneId, setZoneId] = React.useState("");
  const [name, setName] = React.useState("");
  const [hostname, setHostname] = React.useState(portalHostname ?? "");
  const [bridgeHostname, setBridgeHostname] = React.useState(serviceHostname ?? "");
  const refresh = React.useCallback(
    () =>
      void listDomains()
        .then(setDomains)
        .catch((e) => toast.error(e instanceof Error ? e.message : "Domains could not be loaded.")),
    []
  );
  React.useEffect(refresh, [refresh]);
  async function loadZones() {
    try {
      const next = (await listCloudflareZones(token)).filter((zone) => zone.status === "active");
      setZones(next);
      const migrated = domains.find((domain) => !domain.zoneId);
      const selected = next.find((zone) => zone.name === migrated?.name) ?? next[0];
      if (selected) chooseZone(selected.id, next);
      toast.success(
        `${next.length} active Cloudflare domain${next.length === 1 ? "" : "s"} loaded.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Cloudflare domains could not be loaded."
      );
    }
  }
  function chooseZone(id: string, source = zones) {
    const selected = source.find((zone) => zone.id === id);
    setZoneId(id);
    setName(selected?.name ?? "");
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await provisionDomain({ apiToken: token, zoneId, name, enableSending: true });
      setToken("");
      setName("");
      setZoneId("");
      refresh();
      onChanged();
      toast.success("Domain connected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Domain setup failed.");
    }
  }
  async function portal(e: React.FormEvent) {
    e.preventDefault();
    const domain = domains.find((item) => hostname.endsWith(`.${item.name}`));
    if (!domain?.zoneId)
      return toast.error("The portal must use a connected domain with a Cloudflare zone.");
    try {
      await changePortal({ apiToken: token, zoneId: domain.zoneId, hostname });
      setToken("");
      onChanged();
      toast.success("Portal address changed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Portal change failed.");
    }
  }
  async function service(e: React.FormEvent) {
    e.preventDefault();
    if (bridgeHostname === portalHostname)
      return toast.error("The bridge origin must differ from the workspace portal.");
    const domain = domains.find((item) => bridgeHostname.endsWith(`.${item.name}`));
    if (!domain?.zoneId)
      return toast.error("The bridge origin must use a connected domain with a Cloudflare zone.");
    try {
      await changeServiceOrigin({
        apiToken: token,
        zoneId: domain.zoneId,
        hostname: bridgeHostname
      });
      setToken("");
      onChanged();
      toast.success("Bridge origin changed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bridge origin change failed.");
    }
  }
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email domains</CardTitle>
          <CardDescription>
            Domains group infrastructure. Access remains attached to mailboxes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {domains.map((domain) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              key={domain.id}
            >
              <div>
                <p className="font-medium">{domain.name}</p>
                <p className="text-xs text-muted-foreground">
                  Receive {domain.receivingStatus} · Send {domain.sendingStatus} · DNS{" "}
                  {domain.dnsStatus}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={domain.isEnabled ? "secondary" : "outline"}>
                  {domain.isEnabled ? "Enabled" : "Disabled"}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void updateDomain(domain.id, { isEnabled: !domain.isEnabled }).then(refresh)
                  }
                >
                  {domain.isEnabled ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cloudflare changes</CardTitle>
          <CardDescription>
            The token is used for this operation only and is never stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              type="password"
              placeholder="Temporary Cloudflare API token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button
              disabled={token.length < 20}
              type="button"
              variant="outline"
              onClick={() => void loadZones()}
            >
              Load domains
            </Button>
          </div>
          <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={(e) => void add(e)}>
            <Select required value={zoneId} onValueChange={chooseZone}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an active Cloudflare domain" />
              </SelectTrigger>
              <SelectContent>
                {zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={!name || !zoneId} type="submit">
              Connect domain
            </Button>
          </form>
          <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={(e) => void portal(e)}>
            <Input
              required
              placeholder="mail.example.com"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
            />
            <Button type="submit">Change portal</Button>
          </form>
          <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={(e) => void service(e)}>
            <Input
              required
              placeholder="bridge.example.com"
              value={bridgeHostname}
              onChange={(e) => setBridgeHostname(e.target.value)}
            />
            <Button type="submit">Change bridge origin</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
