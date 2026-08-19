import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  createWorkerDomainsClient,
  planAttachment,
  requireCloudflareApiToken
} from "../../../scripts/hqbase/cloudflare-domains.mjs";
import { createWranglerConfig } from "../../../scripts/hqbase/config.mjs";
import { configureDomain } from "../../../scripts/hqbase/domain.mjs";
import {
  assertResumable,
  domainChangeNotes,
  resolveServiceOrigin,
  updateDomainManifest
} from "../../../scripts/hqbase/domain-plan.mjs";
import { assertUnambiguousManifest } from "../../../scripts/hqbase/lifecycle-manifest.mjs";
import {
  configPath,
  deploymentDir,
  loadManifest,
  manifestPath,
  writeManifest
} from "../../../scripts/hqbase/manifest.mjs";

const accountId = "a".repeat(32);
const deployment = "domain-command-test";

function manifest(overrides = {}) {
  return {
    version: 3,
    name: deployment,
    accountId,
    worker: { name: "hqbase-qa", deployed: true },
    d1: { name: "hqbase-qa", id: "11111111-1111-4111-8111-111111111111", ownership: "created" },
    r2: { bucket: "hqbase-qa-mail", ownership: "created" },
    queue: {
      primary: { name: "hqbase-qa-jobs", id: "1".repeat(32), ownership: "created" },
      deadLetter: { name: "hqbase-qa-jobs-dlq", id: "2".repeat(32), ownership: "created" }
    },
    appDomain: "old.example.com",
    authUrl: "https://old.example.com",
    cloudflareOAuth: { mode: "official" },
    email: null,
    ...overrides
  };
}

function install(overrides = {}) {
  const record = manifest(overrides);
  writeManifest(record);
  return record;
}

/** A fake Wrangler that answers only the identity checks the operator performs. */
function fakeWrangler() {
  const calls = [];
  const runCommand = (command, args = []) => {
    calls.push([command, ...args].join(" "));
    const label = args.join(" ");
    if (label.includes("whoami")) {
      return JSON.stringify({ accounts: [{ id: accountId, name: "QA" }] });
    }
    if (label.includes("d1 list")) {
      return JSON.stringify([{ uuid: "11111111-1111-4111-8111-111111111111", name: "hqbase-qa" }]);
    }
    if (label.includes("r2 bucket info")) {
      return JSON.stringify({ name: "hqbase-qa-mail" });
    }
    if (label.includes("queues info")) {
      const name = args[args.indexOf("info") + 1];
      const id = name.endsWith("-dlq") ? "2".repeat(32) : "1".repeat(32);
      return `Queue Name: ${name}\nQueue ID: ${id}\n`;
    }
    return "";
  };
  return { calls, runCommand };
}

function fakeDomains(initial = []) {
  const records = [...initial];
  const calls = [];
  return {
    calls,
    records,
    async list() {
      return records.map((record) => ({ ...record }));
    },
    async attach({ hostname, service, override }) {
      calls.push({ kind: "attach", hostname, service, override });
      const record = { id: `domain-${hostname}`, hostname, service };
      const index = records.findIndex((candidate) => candidate.hostname === hostname);
      if (index >= 0) {
        records[index] = record;
      } else {
        records.push(record);
      }
      return record;
    },
    async remove(id) {
      calls.push({ kind: "remove", id });
      const index = records.findIndex((candidate) => candidate.id === id);
      if (index < 0) {
        throw new Error(`Unknown domain ${id}`);
      }
      records.splice(index, 1);
    },
    async findZone(hostname) {
      return { id: "zone-1", name: hostname.split(".").slice(-2).join(".") };
    }
  };
}

function harness(overrides = {}) {
  const wrangler = fakeWrangler();
  const domains = overrides.domains ?? fakeDomains();
  const deploys = [];
  return {
    domains,
    deploys,
    wrangler,
    options: {
      domains,
      deployConfiguration: (input) => deploys.push(input),
      environment: { CLOUDFLARE_API_TOKEN: "token" },
      probe: overrides.probe ?? (async () => "https://new.example.com"),
      retry: { attempts: 1, delayMs: 0 },
      runCommand: wrangler.runCommand,
      ...overrides.options
    }
  };
}

afterEach(() => {
  fs.rmSync(deploymentDir(deployment), { recursive: true, force: true });
});

describe("operator domain command", () => {
  it("attaches, verifies, cuts over, and commits the manifest only after Cloudflare confirms", async () => {
    install();
    const { domains, deploys, options, wrangler } = harness();

    await configureDomain(
      { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
      options
    );

    expect(domains.calls[0]).toMatchObject({ kind: "attach", hostname: "new.example.com" });
    expect(deploys).toHaveLength(1);
    const saved = loadManifest(deployment);
    expect(saved.appDomain).toBe("new.example.com");
    expect(saved.authUrl).toBe("https://new.example.com");
    expect(saved.domainMove).toBeUndefined();
    expect(saved.d1).toEqual(manifest().d1);
    expect(saved.r2).toEqual(manifest().r2);
    expect(saved.queue).toEqual(manifest().queue);
    expect(wrangler.calls.some((call) => call.includes("d1 execute"))).toBe(true);
  });

  it("keeps the old hostname attached and records the canonical portal host", async () => {
    install();
    const domains = fakeDomains([
      { id: "domain-old.example.com", hostname: "old.example.com", service: "hqbase-qa" }
    ]);
    const { options, wrangler } = harness({
      domains,
      probe: async () => "https://old.example.com"
    });

    await configureDomain(
      { name: deployment, "app-domain": "new.example.com", "keep-service-origin": true },
      options
    );

    const saved = loadManifest(deployment);
    expect(saved.retiredDomains).toEqual(["old.example.com"]);
    expect(saved.authUrl).toBe("https://old.example.com");
    expect(domains.calls.some((call) => call.kind === "remove")).toBe(false);
    expect(domains.records.map((record) => record.hostname).sort()).toEqual([
      "new.example.com",
      "old.example.com"
    ]);
    const redirect = wrangler.calls.find((call) => call.includes("d1 execute"));
    expect(redirect).toMatch(/is_canonical = 1[\s\S]*new\.example\.com/);
    expect(JSON.parse(fs.readFileSync(configPath(deployment), "utf8")).routes).toEqual([
      { pattern: "new.example.com", custom_domain: true },
      { pattern: "old.example.com", custom_domain: true }
    ]);
  });

  it("deletes the previous hostname only when the operator asks for it", async () => {
    install();
    const domains = fakeDomains([
      { id: "domain-old.example.com", hostname: "old.example.com", service: "hqbase-qa" }
    ]);
    const { options } = harness({ domains });

    await configureDomain(
      {
        name: deployment,
        "app-domain": "new.example.com",
        "move-service-origin": true,
        "detach-old": true,
        yes: true
      },
      options
    );

    expect(domains.calls).toContainEqual({ kind: "remove", id: "domain-old.example.com" });
    expect(domains.records.map((record) => record.hostname)).toEqual(["new.example.com"]);
    expect(loadManifest(deployment).retiredDomains).toEqual([]);
  });

  it("really deletes the custom domain and its DNS record on detach", async () => {
    install();
    const domains = fakeDomains([
      { id: "domain-old.example.com", hostname: "old.example.com", service: "hqbase-qa" }
    ]);
    const { deploys, options } = harness({ domains });

    await configureDomain(
      { name: deployment, detach: true, "move-service-origin": true, yes: true },
      options
    );

    expect(domains.calls).toEqual([{ kind: "remove", id: "domain-old.example.com" }]);
    expect(domains.records).toEqual([]);
    const saved = loadManifest(deployment);
    expect(saved.appDomain).toBeUndefined();
    expect(saved.authUrl).toBeUndefined();
    expect(deploys).toHaveLength(1);
    const config = JSON.parse(fs.readFileSync(configPath(deployment), "utf8"));
    expect(config.routes).toBeUndefined();
    expect(config.vars.BETTER_AUTH_URL).toBeUndefined();
  });

  it("refuses to detach without --yes", async () => {
    install();
    const { domains, options } = harness();

    await expect(
      configureDomain({ name: deployment, detach: true, "move-service-origin": true }, options)
    ).rejects.toThrowError(/requires --yes/);
    expect(domains.calls).toEqual([]);
  });

  it("deploys the new service origin as configuration for the active release", async () => {
    install();
    const { deploys, options } = harness();

    await configureDomain(
      { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
      options
    );

    expect(deploys[0].configFile).toBe(configPath(deployment));
    const config = JSON.parse(fs.readFileSync(configPath(deployment), "utf8"));
    expect(config.vars.BETTER_AUTH_URL).toBe("https://new.example.com");
    expect(config.routes).toEqual([
      { pattern: "new.example.com", custom_domain: true },
      { pattern: "old.example.com", custom_domain: true }
    ]);
  });

  it("fails closed when the deployed service origin does not match the manifest", async () => {
    install();
    const { options } = harness({ probe: async () => "https://old.example.com" });

    await expect(
      configureDomain(
        { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
        options
      )
    ).rejects.toThrowError(/BETTER_AUTH_URL was not deployed/);
    expect(loadManifest(deployment).appDomain).toBe("old.example.com");
  });

  it("refuses a hostname that already routes to another Worker", async () => {
    install();
    const domains = fakeDomains([
      { id: "domain-new", hostname: "new.example.com", service: "someone-else" }
    ]);
    const { options } = harness({ domains });

    await expect(
      configureDomain(
        { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
        options
      )
    ).rejects.toThrowError(/already routes to Worker "someone-else"/);
    expect(domains.calls).toEqual([]);
  });

  it("refuses to take over a hostname without an explicit confirmation", async () => {
    install();
    const domains = fakeDomains([
      { id: "domain-new", hostname: "new.example.com", service: "someone-else" }
    ]);
    const { options } = harness({ domains });

    await expect(
      configureDomain(
        {
          name: deployment,
          "app-domain": "new.example.com",
          "move-service-origin": true,
          "override-existing": true
        },
        options
      )
    ).rejects.toThrowError(/without an explicit confirmation/);
    expect(domains.calls).toEqual([]);
    expect(loadManifest(deployment).appDomain).toBe("old.example.com");
  });

  it("rolls back the attachment and keeps the saved record when verification fails", async () => {
    install();
    const domains = fakeDomains();
    const { options } = harness({
      domains,
      probe: async () => {
        throw new Error("no certificate yet");
      }
    });

    await expect(
      configureDomain(
        { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
        options
      )
    ).rejects.toThrowError(/did not serve a healthy HQBase installation/);

    expect(domains.calls.map((call) => call.kind)).toEqual(["attach", "remove"]);
    expect(domains.records).toEqual([]);
    const saved = loadManifest(deployment);
    expect(saved.appDomain).toBe("old.example.com");
    expect(saved.authUrl).toBe("https://old.example.com");
    expect(saved.domainMove.state).toBe("rolled-back");
    expect(JSON.parse(fs.readFileSync(configPath(deployment), "utf8")).routes).toEqual([
      { pattern: "old.example.com", custom_domain: true }
    ]);
  });

  it("redeploys the previous configuration when the cutover fails", async () => {
    install();
    const domains = fakeDomains();
    let probes = 0;
    const { deploys, options } = harness({
      domains,
      probe: async () => {
        probes += 1;
        if (probes === 1) {
          return "https://old.example.com";
        }
        throw new Error("origin is unreachable");
      }
    });

    await expect(
      configureDomain(
        { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
        options
      )
    ).rejects.toThrowError(/did not serve a healthy HQBase installation/);

    expect(deploys).toHaveLength(2);
    expect(loadManifest(deployment).appDomain).toBe("old.example.com");
    expect(JSON.parse(fs.readFileSync(configPath(deployment), "utf8")).vars.BETTER_AUTH_URL).toBe(
      "https://old.example.com"
    );
  });

  it("does not write anything for a dry run", async () => {
    install();
    const { domains, deploys, options } = harness();
    const before = fs.readFileSync(manifestPath(deployment), "utf8");

    await configureDomain(
      {
        name: deployment,
        "app-domain": "new.example.com",
        "move-service-origin": true,
        "dry-run": true
      },
      options
    );

    expect(fs.readFileSync(manifestPath(deployment), "utf8")).toBe(before);
    expect(fs.existsSync(configPath(deployment))).toBe(false);
    expect(domains.calls).toEqual([]);
    expect(deploys).toEqual([]);
  });

  it("resumes the same move and refuses a different one", async () => {
    const staged = install({
      domainMove: {
        startedAt: "2026-08-18T00:00:00.000Z",
        state: "attached",
        fromAppDomain: "old.example.com",
        toAppDomain: "new.example.com",
        fromAuthUrl: "https://old.example.com",
        toAuthUrl: "https://new.example.com",
        detachOld: false,
        attachedDomainId: "domain-new.example.com",
        attachedByThisRun: true,
        deployed: false
      }
    });
    const domains = fakeDomains([
      { id: "domain-old.example.com", hostname: "old.example.com", service: "hqbase-qa" },
      { id: "domain-new.example.com", hostname: "new.example.com", service: "hqbase-qa" }
    ]);
    const { options } = harness({ domains });

    expect(() => assertUnambiguousManifest(staged)).toThrowError(/unfinished domain move/);
    await expect(
      configureDomain(
        { name: deployment, "app-domain": "other.example.com", "move-service-origin": true },
        options
      )
    ).rejects.toThrowError(/unfinished domain move/);

    await configureDomain(
      { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
      options
    );
    const saved = loadManifest(deployment);
    expect(saved.appDomain).toBe("new.example.com");
    expect(saved.domainMove).toBeUndefined();
    expect(domains.calls.filter((call) => call.kind === "attach")).toEqual([]);
  });
});

describe("operator domain contract", () => {
  it("never moves the service origin with the portal unless asked", () => {
    expect(
      resolveServiceOrigin(
        { appDomain: "old.example.com", authUrl: "https://service.example.com" },
        { appDomain: "new.example.com" }
      )
    ).toEqual({ authUrl: "https://service.example.com", moved: false });
    expect(() =>
      resolveServiceOrigin(
        { appDomain: "old.example.com", authUrl: "https://old.example.com" },
        { appDomain: "new.example.com" }
      )
    ).toThrowError(/--keep-service-origin|--move-service-origin/);
  });

  it("keeps the service origin hostname attached when the portal moves away from it", () => {
    const after = updateDomainManifest(manifest(), {
      appDomain: "new.example.com",
      keepServiceOrigin: true
    });

    expect(after.appDomain).toBe("new.example.com");
    expect(after.retiredDomains).toEqual(["old.example.com"]);
    expect(createWranglerConfig(after).routes).toEqual([
      { pattern: "new.example.com", custom_domain: true },
      { pattern: "old.example.com", custom_domain: true }
    ]);
    expect(createWranglerConfig(after).vars.BETTER_AUTH_URL).toBe("https://old.example.com");
  });

  it("refuses to delete the hostname that serves the service origin", () => {
    expect(() =>
      updateDomainManifest(manifest(), {
        appDomain: "new.example.com",
        keepServiceOrigin: true,
        detachOld: true
      })
    ).toThrowError(/serves the machine-facing service origin/);
  });

  it("refuses to detach when customer-managed OAuth needs a canonical origin", () => {
    expect(() =>
      updateDomainManifest(
        manifest({ cloudflareOAuth: { mode: "customer", clientId: "customer-client" } }),
        { detach: true, moveServiceOrigin: true }
      )
    ).toThrowError(/requires --auth-url/);
  });

  it("rejects invalid or conflicting input", () => {
    expect(() => updateDomainManifest(manifest(), {})).toThrowError(/--app-domain/);
    expect(() =>
      updateDomainManifest(manifest(), { appDomain: "a.example.com", detach: true })
    ).toThrowError(/not both/);
    expect(() =>
      updateDomainManifest(manifest(), { appDomain: "https://a.example.com/x" })
    ).toThrowError(/bare hostname/);
    expect(() => updateDomainManifest(manifest(), { appDomain: "localhost" })).toThrowError(
      /bare hostname/
    );
    expect(() =>
      updateDomainManifest(manifest(), { detach: true, authUrl: "https://a.example.com" })
    ).toThrowError(/cannot survive --detach/);
  });

  it("refuses an unfinished move to a different hostname", () => {
    const staged = manifest({
      domainMove: { toAppDomain: "new.example.com", toAuthUrl: null, startedAt: "now" }
    });
    expect(() => assertResumable(staged, { appDomain: "other.example.com" })).toThrowError(
      /unfinished domain move/
    );
    expect(() =>
      assertResumable(staged, { appDomain: "new.example.com", authUrl: undefined })
    ).not.toThrow();
  });

  it("explains the operational consequences of a move", () => {
    const before = manifest();
    const after = updateDomainManifest(before, {
      appDomain: "new.example.com",
      moveServiceOrigin: true
    });
    const notes = domainChangeNotes(before, after).join("\n");

    expect(notes).toMatch(/old\.example\.com stays attached and redirects/);
    expect(notes).toMatch(/new\.example\.com must be a zone/);
    expect(notes).toMatch(/Service origin changed to https:\/\/new\.example\.com/);
    expect(notes).toMatch(/D1, R2, and queues were not modified/);
  });
});

describe("Cloudflare custom domain seam", () => {
  it("never lets Cloudflare override an origin or DNS record implicitly", async () => {
    const requests = [];
    const client = createWorkerDomainsClient({
      accountId,
      token: "token",
      fetchImpl: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          async json() {
            return { success: true, result: { id: "domain-1" } };
          }
        };
      }
    });

    await client.attach({
      hostname: "new.example.com",
      service: "hqbase-qa",
      zoneId: "zone-1",
      zoneName: "example.com"
    });
    const body = JSON.parse(requests[0].init.body);
    expect(requests[0].url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/domains`
    );
    expect(body.override_existing_origin).toBe(false);
    expect(body.override_existing_dns_record).toBe(false);

    await client.remove("domain-1");
    expect(requests[1].init.method).toBe("DELETE");
    expect(requests[1].url).toMatch(/\/workers\/domains\/domain-1$/);
  });

  it("classifies an attachment before anything is changed", () => {
    const domains = [{ id: "a", hostname: "app.example.com", service: "other-worker" }];
    expect(planAttachment(domains, { hostname: "app.example.com", service: "hqbase-qa" })).toEqual({
      action: "conflict",
      existing: domains[0]
    });
    expect(
      planAttachment(domains, { hostname: "app.example.com", service: "other-worker" })
    ).toEqual({ action: "keep", existing: domains[0] });
    expect(planAttachment(domains, { hostname: "new.example.com", service: "hqbase-qa" })).toEqual({
      action: "attach",
      existing: null
    });
  });

  it("requires an explicit Cloudflare API token", () => {
    expect(() => requireCloudflareApiToken({})).toThrowError(/CLOUDFLARE_API_TOKEN/);
    expect(requireCloudflareApiToken({ CLOUDFLARE_API_TOKEN: " token " })).toBe("token");
  });
});
