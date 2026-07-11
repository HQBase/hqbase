import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { changePortal, listDomains, provisionDomain, updateDomain } from "./api";
import type { MailDomain } from "./types";
export function DomainSettings({
  portalHostname,
  onChanged
}: {
  portalHostname: string | null;
  onChanged: () => void;
}) {
  const [domains, setDomains] = React.useState<MailDomain[]>([]);
  const [token, setToken] = React.useState("");
  const [zoneId, setZoneId] = React.useState("");
  const [name, setName] = React.useState("");
  const [hostname, setHostname] = React.useState(portalHostname ?? "");
  const [workerName, setWorkerName] = React.useState("hqbase-pro");
  const refresh = React.useCallback(
    () =>
      void listDomains()
        .then(setDomains)
        .catch((e) => toast.error(e instanceof Error ? e.message : "Domains could not be loaded.")),
    []
  );
  React.useEffect(refresh, [refresh]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await provisionDomain({ apiToken: token, zoneId, workerName, name, enableSending: true });
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
      await changePortal({ apiToken: token, zoneId: domain.zoneId, workerName, hostname });
      onChanged();
      toast.success("Portal address changed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Portal change failed.");
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
          <Input
            type="password"
            placeholder="Temporary Cloudflare API token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Input
            placeholder="Worker name"
            value={workerName}
            onChange={(e) => setWorkerName(e.target.value)}
          />
          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => void add(e)}>
            <Input
              required
              placeholder="example.com"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              required
              placeholder="Cloudflare zone ID"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
            />
            <Button type="submit">Add domain</Button>
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
        </CardContent>
      </Card>
    </div>
  );
}
