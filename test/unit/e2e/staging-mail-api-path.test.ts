import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stagingMailApiPath } from "../../e2e/staging/mail-api-path";

const lifecycleSpec = readFileSync(
  new URL("../../e2e/staging/lifecycle.spec.ts", import.meta.url),
  "utf8"
);
const releaseWorkflow = readFileSync(
  new URL("../../../.github/workflows/release.yml", import.meta.url),
  "utf8"
);

describe("staging Mail API path", () => {
  it("uses the versioned API for candidate staging by default", () => {
    expect(stagingMailApiPath("/mailboxes")).toBe("/api/v2/mailboxes");
  });

  it("supports the compatibility alias while bootstrapping the previous release", () => {
    expect(stagingMailApiPath("/mailboxes", "/api")).toBe("/api/mailboxes");
  });

  it("rejects unsupported base paths and malformed route paths", () => {
    expect(() => stagingMailApiPath("/mailboxes", "/api/v1")).toThrow(
      "HQBASE_STAGING_MAIL_API_BASE_PATH must be /api or /api/v2."
    );
    expect(() => stagingMailApiPath("mailboxes")).toThrow(
      "Staging Mail API paths must start with /."
    );
  });

  it("uses the legacy alias only for the N-1 bootstrap workflow step", () => {
    expect(lifecycleSpec).not.toContain('"/api/v2/mailboxes"');
    const bootstrapStart = releaseWorkflow.indexOf(
      "      - name: Bootstrap persistent N-1 staging data"
    );
    const nextStep = releaseWorkflow.indexOf("\n      - name:", bootstrapStart + 1);
    const bootstrapStep = releaseWorkflow.slice(bootstrapStart, nextStep);

    expect(bootstrapStart).toBeGreaterThan(-1);
    expect(bootstrapStep).toContain("HQBASE_STAGING_MAIL_API_BASE_PATH: /api");
    expect(bootstrapStep).toContain("run: pnpm test:e2e:staging:lifecycle");
  });

  it("skips candidate-only mailbox agent checks during N-1 bootstrap", () => {
    const agentTestStart = lifecycleSpec.indexOf(
      'test("a mailbox agent stays inside its assigned mailbox and revokes cleanly"'
    );
    const nextTest = lifecycleSpec.indexOf('\ntest("candidate mail experience', agentTestStart);
    const agentTest = lifecycleSpec.slice(agentTestStart, nextTest);

    expect(agentTestStart).toBeGreaterThan(-1);
    expect(nextTest).toBeGreaterThan(agentTestStart);
    expect(agentTest).toContain('HQBASE_STAGING_MAIL_API_BASE_PATH ?? "/api/v2"');
    expect(agentTest).toContain('=== "/api"');
    expect(agentTest.indexOf("test.skip(")).toBeLessThan(agentTest.indexOf("request.post("));
  });
});
