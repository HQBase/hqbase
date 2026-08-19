const apiBase = "https://api.cloudflare.com/client/v4";

/**
 * Worker custom domains are account resources, not Wrangler configuration. Wrangler publishes them
 * as a side effect of a deploy and, without a TTY, silently sets override_existing_origin and
 * override_existing_dns_record. The operator therefore reads and writes them through the documented
 * Cloudflare API, where every override is explicit and every result can be verified.
 */
export function requireCloudflareApiToken(environment = process.env) {
  const token = environment.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Refusing to continue: set CLOUDFLARE_API_TOKEN for the domain command. The token needs Workers Scripts:Edit, Zone:Read, and DNS:Edit for the target zone."
    );
  }
  return token;
}

export function createWorkerDomainsClient({ accountId, token, fetchImpl }) {
  const call = fetchImpl ?? globalThis.fetch;

  async function request(path, init) {
    const response = await call(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${token}`
      }
    });
    const body = await response.json();
    if (!response.ok || body?.success !== true) {
      const message = body?.errors?.[0]?.message ?? `HTTP ${response.status}`;
      throw new Error(`Cloudflare rejected ${path}: ${message}`);
    }
    return body.result;
  }

  return {
    async list() {
      const result = await request(`/accounts/${accountId}/workers/domains`);
      return Array.isArray(result) ? result : [];
    },
    async attach({ hostname, service, zoneId, zoneName, override = false }) {
      return request(`/accounts/${accountId}/workers/domains`, {
        method: "PUT",
        body: JSON.stringify({
          environment: "production",
          hostname,
          service,
          zone_id: zoneId,
          zone_name: zoneName,
          // Always explicit. Wrangler defaults these to true without a TTY.
          override_existing_origin: override,
          override_existing_dns_record: override
        })
      });
    },
    async remove(id) {
      return request(`/accounts/${accountId}/workers/domains/${id}`, { method: "DELETE" });
    },
    async findZone(hostname) {
      const labels = hostname.split(".");
      for (let index = 0; index < labels.length - 1; index += 1) {
        const candidate = labels.slice(index).join(".");
        const zones = await request(`/zones?name=${encodeURIComponent(candidate)}`);
        const zone = Array.isArray(zones) ? zones[0] : null;
        if (zone?.id) {
          return { id: zone.id, name: zone.name };
        }
      }
      return null;
    }
  };
}

/**
 * Decide what an attachment would do before anything is changed in Cloudflare.
 */
export function planAttachment(domains, { hostname, service }) {
  const existing = domains.find((domain) => domain?.hostname === hostname);
  if (!existing) {
    return { action: "attach", existing: null };
  }
  if (existing.service === service) {
    return { action: "keep", existing };
  }
  return { action: "conflict", existing };
}

export function assertAttachmentAllowed(plan, { confirmed, hostname, override, service }) {
  if (plan.action !== "conflict") {
    return plan;
  }
  if (!override) {
    throw new Error(
      `Refusing to attach ${hostname}: it already routes to Worker "${plan.existing.service}", not "${service}". Choose another hostname, or re-run with --override-existing --yes to take it over.`
    );
  }
  if (!confirmed) {
    throw new Error(
      `Refusing to take over ${hostname} from Worker "${plan.existing.service}" without an explicit confirmation. Re-run with --override-existing --yes.`
    );
  }
  return plan;
}
