const apiBase = "https://api.cloudflare.com/client/v4";

/**
 * Worker custom domains are account resources, not Wrangler configuration. Wrangler publishes them
 * as a side effect of a deploy and, without a TTY, silently sets override_existing_origin and
 * override_existing_dns_record. The operator therefore reads and writes them through the documented
 * Cloudflare API, where every override is explicit and every result can be verified.
 */
export function requireDomainApiToken(environment = process.env) {
  const token = environment.HQBASE_DOMAIN_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Refusing to continue: set HQBASE_DOMAIN_API_TOKEN for the domain command. Use a short-lived token with Workers Scripts:Edit and Zone:Read, then unset it after the command."
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
    let body;
    try {
      body = await response.json();
    } catch {
      if (response.ok && init?.method === "DELETE") return null;
      throw new Error(
        `Cloudflare returned an unreadable response for ${path} (HTTP ${response.status}).`
      );
    }
    if (!response.ok || body?.success !== true) {
      const message = body?.errors?.[0]?.message ?? `HTTP ${response.status}`;
      throw new Error(`Cloudflare rejected ${path}: ${message}`);
    }
    return body.result;
  }

  return {
    async list(filters = {}) {
      const query = new URLSearchParams({ environment: "production" });
      if (filters.hostname) query.set("hostname", filters.hostname);
      if (filters.service) query.set("service", filters.service);
      const result = await request(`/accounts/${accountId}/workers/domains?${query}`);
      return Array.isArray(result) ? result : [];
    },
    async attach({ hostname, service, zoneId, zoneName }) {
      return request(`/accounts/${accountId}/workers/domains`, {
        method: "PUT",
        body: JSON.stringify({
          environment: "production",
          hostname,
          service,
          zone_id: zoneId,
          zone_name: zoneName,
          // Always explicit. Wrangler defaults these to true without a TTY.
          override_existing_origin: false,
          override_existing_dns_record: false
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
        const query = new URLSearchParams({ "account.id": accountId, name: candidate });
        const zones = await request(`/zones?${query}`);
        const zone = Array.isArray(zones)
          ? zones.find((item) => item?.account?.id === accountId)
          : null;
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

export function assertAttachmentAllowed(plan, { hostname, service }) {
  if (plan.action !== "conflict") {
    return plan;
  }
  throw new Error(
    `Refusing to attach ${hostname}: it already routes to Worker "${plan.existing.service}", not "${service}". Remove or move that domain explicitly in Cloudflare before retrying.`
  );
}
