import { describe, expect, it } from "vitest";

import { createWranglerConfig } from "../../../scripts/hqbase/config.mjs";
import { domainChangeNotes, updateDomainManifest } from "../../../scripts/hqbase/domain.mjs";

function manifest(overrides = {}) {
  return {
    version: 2,
    name: "qa",
    worker: { name: "hqbase-qa" },
    d1: { name: "hqbase-qa", id: "d1-id", reused: false },
    r2: { bucket: "hqbase-qa-mail", reused: false },
    queue: { name: "hqbase-qa-jobs", deadLetterName: "hqbase-qa-jobs-dlq" },
    appDomain: "old.example.com",
    authUrl: undefined,
    cloudflareOAuth: { mode: "official" },
    email: null,
    ...overrides
  };
}

describe("operator domain move", () => {
  it("swaps the custom domain and leaves data resources untouched", () => {
    const before = manifest();
    const after = updateDomainManifest(before, { appDomain: "New.Example.com." });

    expect(after.appDomain).toBe("new.example.com");
    expect(after.d1).toEqual(before.d1);
    expect(after.r2).toEqual(before.r2);
    expect(after.queue).toEqual(before.queue);
    expect(after.authUrl).toBeUndefined();
    expect(createWranglerConfig(after).routes).toEqual([
      { pattern: "new.example.com", custom_domain: true }
    ]);
  });

  it("follows the new host when a canonical auth origin was previously pinned", () => {
    const after = updateDomainManifest(manifest({ authUrl: "https://old.example.com" }), {
      appDomain: "new.example.com"
    });

    expect(after.authUrl).toBe("https://new.example.com");
    expect(createWranglerConfig(after).vars.BETTER_AUTH_URL).toBe("https://new.example.com");
  });

  it("honors an explicit --auth-url", () => {
    const after = updateDomainManifest(manifest(), {
      appDomain: "new.example.com",
      authUrl: "https://login.example.com"
    });

    expect(after.authUrl).toBe("https://login.example.com");
  });

  it("detaches the custom domain and drops the derived auth origin", () => {
    const after = updateDomainManifest(manifest({ authUrl: "https://old.example.com" }), {
      detach: true
    });

    expect(after.appDomain).toBeUndefined();
    expect(after.authUrl).toBeUndefined();
    expect(createWranglerConfig(after).routes).toBeUndefined();
    expect(createWranglerConfig(after).vars.BETTER_AUTH_URL).toBeUndefined();
  });

  it("keeps customer-managed OAuth valid on the new origin", () => {
    const after = updateDomainManifest(
      manifest({
        authUrl: "https://old.example.com",
        cloudflareOAuth: { mode: "customer", clientId: "customer-client" }
      }),
      { appDomain: "new.example.com" }
    );

    expect(after.cloudflareOAuth).toEqual({ mode: "customer", clientId: "customer-client" });
    expect(after.authUrl).toBe("https://new.example.com");
  });

  it("refuses to detach when customer-managed OAuth needs a canonical origin", () => {
    expect(() =>
      updateDomainManifest(
        manifest({
          authUrl: "https://old.example.com",
          cloudflareOAuth: { mode: "customer", clientId: "customer-client" }
        }),
        { detach: true }
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
  });

  it("explains the operational consequences of a move", () => {
    const before = manifest({ authUrl: "https://old.example.com" });
    const after = updateDomainManifest(before, { appDomain: "new.example.com" });
    const notes = domainChangeNotes(before, after).join("\n");

    expect(notes).toMatch(/detaches old.example.com/);
    expect(notes).toMatch(/new.example.com must be a zone/);
    expect(notes).toMatch(/sign in again/);
    expect(notes).toMatch(/D1, R2, and queues were not modified/);
  });
});
