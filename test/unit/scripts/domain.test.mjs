import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createWorkerDomainsClient,
  planAttachment,
  requireDomainApiToken
} from "../../../scripts/hqbase/cloudflare-domains.mjs";
import { createWranglerConfig } from "../../../scripts/hqbase/config.mjs";
import { configureDomain } from "../../../scripts/hqbase/domain.mjs";
import {
  assertResumable,
  domainChangeNotes,
  migrateStagedMoveRecord,
  resolveServiceOrigin,
  stagedMoveRecord,
  updateDomainManifest
} from "../../../scripts/hqbase/domain-plan.mjs";
import {
  canonicalHostnameFromD1Output,
  createDomainProbe,
  setCanonicalPortal
} from "../../../scripts/hqbase/domain-runtime.mjs";
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

function fakeDomains(
  initial = [
    {
      id: "domain-old.example.com",
      hostname: "old.example.com",
      service: "hqbase-qa",
      zone_id: "zone-1",
      zone_name: "example.com"
    }
  ]
) {
  const records = [...initial];
  const calls = [];
  return {
    calls,
    records,
    async list(filters = {}) {
      return records
        .filter(
          (record) =>
            (!filters.hostname || record.hostname === filters.hostname) &&
            (!filters.service || record.service === filters.service)
        )
        .map((record) => ({ ...record }));
    },
    async attach({ hostname, service, zoneId, zoneName }) {
      calls.push({ kind: "attach", hostname, service, zoneId, zoneName });
      const record = {
        id: `domain-${hostname}`,
        hostname,
        service,
        zone_id: zoneId,
        zone_name: zoneName
      };
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
  const canonical = { hostname: overrides.canonicalHostname ?? "old.example.com" };
  return {
    canonical,
    domains,
    deploys,
    wrangler,
    options: {
      domains,
      deployConfiguration: (input) => deploys.push(input),
      environment: { HQBASE_DOMAIN_API_TOKEN: "token" },
      probe: overrides.probe ?? (async () => "https://new.example.com"),
      readCanonicalPortal: async () => canonical.hostname,
      retry: { attempts: 1, delayMs: 0 },
      runCommand: wrangler.runCommand,
      setCanonicalPortal: async ({ hostname }) => {
        canonical.hostname = hostname;
      },
      ...overrides.options
    }
  };
}

function clean() {
  fs.rmSync(deploymentDir(deployment), { recursive: true, force: true });
}

beforeEach(clean);
afterEach(clean);

describe("operator domain command", () => {
  it("attaches, verifies, cuts over, and commits the manifest only after Cloudflare confirms", async () => {
    install();
    const { canonical, domains, deploys, options } = harness();

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
    expect(canonical.hostname).toBe("new.example.com");
  });

  it("keeps the old hostname attached and records the canonical portal host", async () => {
    install();
    const domains = fakeDomains([
      { id: "domain-old.example.com", hostname: "old.example.com", service: "hqbase-qa" }
    ]);
    const { canonical, options } = harness({
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
    expect(canonical.hostname).toBe("new.example.com");
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

  it("preserves other retired hostnames when it deletes the previous portal", async () => {
    install({ retiredDomains: ["legacy.example.com"] });
    const domains = fakeDomains([
      { id: "domain-old.example.com", hostname: "old.example.com", service: "hqbase-qa" },
      {
        id: "domain-legacy.example.com",
        hostname: "legacy.example.com",
        service: "hqbase-qa"
      }
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
    expect(domains.calls).not.toContainEqual({
      kind: "remove",
      id: "domain-legacy.example.com"
    });
    expect(loadManifest(deployment).retiredDomains).toEqual(["legacy.example.com"]);
  });

  it("really deletes the custom domain and its DNS record on detach", async () => {
    install();
    const domains = fakeDomains([
      { id: "domain-old.example.com", hostname: "old.example.com", service: "hqbase-qa" }
    ]);
    const { canonical, deploys, options } = harness({ domains });

    await configureDomain(
      { name: deployment, detach: true, "move-service-origin": true, yes: true },
      options
    );

    expect(domains.calls).toEqual([{ kind: "remove", id: "domain-old.example.com" }]);
    expect(domains.records).toEqual([]);
    const saved = loadManifest(deployment);
    expect(saved.appDomain).toBeUndefined();
    expect(saved.authUrl).toBeUndefined();
    expect(canonical.hostname).toBeNull();
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
      { id: "domain-old", hostname: "old.example.com", service: "hqbase-qa" },
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

  it("refuses the legacy hostname takeover flag", async () => {
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
    ).rejects.toThrowError(/--override-existing is not supported/);
    expect(domains.calls).toEqual([]);
    expect(loadManifest(deployment).appDomain).toBe("old.example.com");
  });

  it("refuses the legacy partial-deployment flag before it changes anything", async () => {
    install();
    const { domains, options } = harness();
    const before = fs.readFileSync(manifestPath(deployment), "utf8");

    await expect(
      configureDomain(
        {
          name: deployment,
          "app-domain": "new.example.com",
          "move-service-origin": true,
          "skip-deploy": true
        },
        options
      )
    ).rejects.toThrowError(/--skip-deploy is not supported/);
    expect(fs.readFileSync(manifestPath(deployment), "utf8")).toBe(before);
    expect(domains.calls).toEqual([]);
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
    expect(domains.records.map((record) => record.hostname)).toEqual(["old.example.com"]);
    const saved = loadManifest(deployment);
    expect(saved.appDomain).toBe("old.example.com");
    expect(saved.authUrl).toBe("https://old.example.com");
    expect(saved.domainMove).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(configPath(deployment), "utf8")).routes).toEqual([
      { pattern: "old.example.com", custom_domain: true }
    ]);
  });

  it("rolls back an attachment when Cloudflare applies it but the response is lost", async () => {
    install();
    const domains = fakeDomains();
    const attach = domains.attach;
    domains.attach = async (input) => {
      await attach(input);
      throw new Error("Cloudflare response was lost");
    };
    const { options } = harness({ domains });

    await expect(
      configureDomain(
        { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
        options
      )
    ).rejects.toThrowError(/response was lost/);

    expect(domains.records.map((record) => record.hostname)).toEqual(["old.example.com"]);
    expect(loadManifest(deployment).domainMove).toBeUndefined();
  });

  it("waits for an asynchronous configuration deployment before it probes", async () => {
    install();
    let deployed = false;
    const { options } = harness({
      probe: async () => (deployed ? "https://new.example.com" : "https://old.example.com"),
      options: {
        deployConfiguration: async () => {
          await Promise.resolve();
          deployed = true;
        }
      }
    });

    await configureDomain(
      { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
      options
    );

    expect(deployed).toBe(true);
    expect(loadManifest(deployment).appDomain).toBe("new.example.com");
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

  it("rolls back an ambiguous configuration deployment", async () => {
    install();
    let deployments = 0;
    const { domains, options } = harness({
      options: {
        deployConfiguration: () => {
          deployments += 1;
          if (deployments === 1) throw new Error("Wrangler disconnected after upload");
        }
      }
    });

    await expect(
      configureDomain(
        { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
        options
      )
    ).rejects.toThrowError(/disconnected after upload/);

    expect(deployments).toBe(2);
    expect(domains.records.map((record) => record.hostname)).toEqual(["old.example.com"]);
    expect(loadManifest(deployment).domainMove).toBeUndefined();
  });

  it("restores a domain when Cloudflare deletes it but the response fails", async () => {
    install();
    const domains = fakeDomains();
    const remove = domains.remove;
    domains.remove = async (id) => {
      await remove(id);
      if (id === "domain-old.example.com") throw new Error("Cloudflare response was lost");
    };
    const { canonical, deploys, options } = harness({ domains });

    await expect(
      configureDomain(
        {
          name: deployment,
          "app-domain": "new.example.com",
          "move-service-origin": true,
          "detach-old": true,
          yes: true
        },
        options
      )
    ).rejects.toThrowError(/response was lost/);

    expect(canonical.hostname).toBe("old.example.com");
    expect(deploys).toHaveLength(2);
    expect(domains.records.map((record) => record.hostname)).toEqual(["old.example.com"]);
    expect(loadManifest(deployment).domainMove).toBeUndefined();
  });

  it("keeps the deployment locked when rollback is incomplete", async () => {
    install();
    const { options } = harness({
      options: {
        deployConfiguration: () => {
          throw new Error("Cloudflare is unavailable");
        }
      }
    });

    await expect(
      configureDomain(
        { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
        options
      )
    ).rejects.toThrowError(/Cloudflare is unavailable/);

    const saved = loadManifest(deployment);
    expect(saved.domainMove).toMatchObject({
      state: "recovery-required",
      recoveryFailures: ["restore Worker configuration"]
    });
    expect(() => assertUnambiguousManifest(saved)).toThrowError(/unfinished domain move/);
  });

  it("runs rollback when a step rejects with a non-Error value", async () => {
    install();
    const { options } = harness({
      options: {
        deployConfiguration: () => {
          throw null;
        }
      }
    });

    let rejection = "not rejected";
    try {
      await configureDomain(
        { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
        options
      );
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeNull();
    expect(loadManifest(deployment).domainMove).toMatchObject({
      state: "recovery-required",
      recoveryFailures: ["restore Worker configuration"]
    });
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
        attachedByThisRun: true
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

  it("migrates a complete version 2 manifest before it builds the target", async () => {
    const legacy = {
      ...manifest(),
      version: 2,
      accountId: undefined,
      d1: { name: "hqbase-qa", id: manifest().d1.id, created: true, reused: false },
      r2: { bucket: "hqbase-qa-mail", created: true, reused: false },
      queue: {
        name: "hqbase-qa-jobs",
        deadLetterName: "hqbase-qa-jobs-dlq",
        created: true
      }
    };
    writeManifest(legacy);
    const { options } = harness();

    await configureDomain(
      { name: deployment, "app-domain": "new.example.com", "move-service-origin": true },
      options
    );

    const saved = loadManifest(deployment);
    expect(saved.version).toBe(3);
    expect(saved.queue).toEqual(manifest().queue);
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

  it("normalizes an explicit service origin before it compares or stores it", () => {
    expect(
      resolveServiceOrigin(
        { appDomain: "old.example.com", authUrl: "https://service.example.com" },
        { appDomain: "new.example.com", authUrl: "https://service.example.com/" }
      )
    ).toEqual({ authUrl: "https://service.example.com", moved: false });
  });

  it("normalizes a stored service origin when it builds the next manifest", () => {
    const after = updateDomainManifest(manifest({ authUrl: "https://old.example.com/" }), {
      appDomain: "new.example.com",
      keepServiceOrigin: true
    });

    expect(after.authUrl).toBe("https://old.example.com");
    expect(after.retiredDomains).toEqual(["old.example.com"]);
  });

  it("adds recovery defaults to fresh and earlier staged move records", () => {
    const defaults = {
      attachedDomainId: null,
      attachedByThisRun: false,
      targetZoneId: null,
      configurationDeployAttempted: false,
      canonicalUpdateAttempted: false,
      pendingRemoval: null,
      removedDomains: []
    };
    expect(
      stagedMoveRecord(manifest(), { appDomain: "new.example.com", authUrl: undefined })
    ).toMatchObject(defaults);
    expect(
      migrateStagedMoveRecord({
        startedAt: "2026-08-17T00:00:00.000Z",
        state: "attached",
        fromAppDomain: "old.example.com",
        toAppDomain: "new.example.com",
        fromAuthUrl: "https://old.example.com",
        toAuthUrl: "https://old.example.com",
        detachOld: false
      })
    ).toMatchObject(defaults);
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
    expect(notes).toMatch(/resource identities were not modified/);
  });
});

describe("Cloudflare custom domain seam", () => {
  it("uses an exact hostname filter so a later API page cannot hide a match", async () => {
    const requests = [];
    const client = createWorkerDomainsClient({
      accountId,
      token: "token",
      fetchImpl: async (url) => {
        requests.push(url);
        return {
          ok: true,
          async json() {
            return { success: true, result: [] };
          }
        };
      }
    });

    await client.list({ hostname: "new.example.com" });

    expect(requests[0]).toContain("environment=production");
    expect(requests[0]).toContain("hostname=new.example.com");
  });

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

  it("accepts an empty successful response when Cloudflare deletes a domain", async () => {
    const client = createWorkerDomainsClient({
      accountId,
      token: "token",
      fetchImpl: async () => ({
        ok: true,
        status: 204,
        async json() {
          throw new SyntaxError("Unexpected end of JSON input");
        }
      })
    });

    await expect(client.remove("domain-1")).resolves.toBeNull();
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
    expect(() => requireDomainApiToken({})).toThrowError(/HQBASE_DOMAIN_API_TOKEN/);
    expect(requireDomainApiToken({ HQBASE_DOMAIN_API_TOKEN: " token " })).toBe("token");
  });

  it("adds Cloudflare Access service-token headers only when both values are set", async () => {
    const requests = [];
    const probe = createDomainProbe(
      {
        HQBASE_DOMAIN_ACCESS_CLIENT_ID: "client-id",
        HQBASE_DOMAIN_ACCESS_CLIENT_SECRET: "client-secret"
      },
      async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          async json() {
            return { servers: [{ url: "https://service.example.com" }] };
          }
        };
      }
    );

    await expect(probe("https://app.example.com/api/v1/openapi.json")).resolves.toBe(
      "https://service.example.com"
    );
    expect(requests[0].init.headers).toMatchObject({
      "cf-access-client-id": "client-id",
      "cf-access-client-secret": "client-secret"
    });
    expect(() => createDomainProbe({ HQBASE_DOMAIN_ACCESS_CLIENT_ID: "client-id" })).toThrowError(
      /both HQBASE_DOMAIN_ACCESS/
    );
  });

  it("aborts a stalled discovery request after its deadline", async () => {
    let requestSignal;
    const probe = createDomainProbe(
      {},
      async (_url, init) => {
        requestSignal = init.signal;
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        });
      },
      { timeoutMs: 10 }
    );

    await expect(probe("https://app.example.com/api/v1/openapi.json")).rejects.toMatchObject({
      name: "TimeoutError"
    });
    expect(requestSignal.aborted).toBe(true);
  });

  it("rejects ambiguous canonical portal query results", () => {
    expect(
      canonicalHostnameFromD1Output(
        JSON.stringify([{ results: [{ hostname: "app.example.com" }] }])
      )
    ).toBe("app.example.com");
    expect(() =>
      canonicalHostnameFromD1Output(
        JSON.stringify([
          { results: [{ hostname: "one.example.com" }, { hostname: "two.example.com" }] }
        ])
      )
    ).toThrowError(/more than one canonical/);
  });

  it("records the verified Cloudflare zone on a new portal row", () => {
    const calls = [];
    setCanonicalPortal({
      hostname: "app.example.com",
      manifest: manifest(),
      runCommand: (_command, args) => {
        calls.push(args);
        return JSON.stringify([{ results: [{ hostname: "app.example.com" }] }]);
      },
      zoneId: "zone-1"
    });

    const sql = calls[0].at(calls[0].indexOf("--command") + 1);
    expect(sql).toContain("'zone-1'");
    expect(sql.indexOf("SET is_canonical = 0")).toBeLessThan(sql.indexOf("SET is_canonical = 1"));
  });

  it("moves the canonical marker without violating the unique portal index", () => {
    const database = new DatabaseSync(":memory:");
    try {
      database.exec(
        fs.readFileSync(new URL("../../../migrations/0001_initial.sql", import.meta.url), "utf8")
      );
      database.exec(
        fs.readFileSync(new URL("../../../migrations/0002_workspace.sql", import.meta.url), "utf8")
      );
      database.exec(`
        INSERT INTO workspace_hosts VALUES
          ('old', 'old.example.com', 'zone-1', 'portal', 0, 'ready', NULL, 'now', 'now'),
          ('new', 'new.example.com', 'zone-1', 'portal', 1, 'ready', NULL, 'now', 'now');
      `);

      setCanonicalPortal({
        hostname: "old.example.com",
        manifest: manifest(),
        runCommand: (_command, args) => {
          const sql = args.at(args.indexOf("--command") + 1);
          if (sql.startsWith("SELECT")) {
            return JSON.stringify([{ results: database.prepare(sql).all() }]);
          }
          database.exec(sql);
          return "";
        },
        zoneId: "zone-1"
      });

      expect(
        database.prepare("SELECT hostname FROM workspace_hosts WHERE is_canonical = 1").get()
      ).toEqual({ hostname: "old.example.com" });
    } finally {
      database.close();
    }
  });
});
