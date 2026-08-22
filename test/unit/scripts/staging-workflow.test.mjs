import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../.github/workflows/staging-e2e.yml", import.meta.url),
  "utf8"
);
const releaseWorkflow = readFileSync(
  new URL("../../../.github/workflows/release.yml", import.meta.url),
  "utf8"
);

describe("staging workflow lifecycle record", () => {
  it("tests a populated SQL migration upgrade before deployment", () => {
    const legacy = workflow.indexOf('set_migrations_dir "migrations-before-0014"');
    const current = workflow.indexOf('set_migrations_dir "../../../migrations"');
    const deploy = workflow.indexOf("pnpm exec wrangler deploy --config");

    expect(legacy).toBeGreaterThan(-1);
    expect(current).toBeGreaterThan(legacy);
    expect(deploy).toBeGreaterThan(current);
    expect(workflow).toContain("sql-upgrade-probe");
    expect(workflow).toContain("msg_sql_upgrade");
    expect(workflow).toContain('"is_unassigned":1');
    expect(workflow).toContain('"migration_count":14');
  });

  it("records the reviewed Worker deploy before cleanup", () => {
    const deploy = workflow.indexOf("pnpm exec wrangler deploy --config");
    const checkpoint = workflow.indexOf("recordWorkerDeployedForConfig");
    const cleanup = workflow.indexOf('pnpm hqbase destroy --name "$DEPLOYMENT_NAME"');

    expect(deploy).toBeGreaterThan(-1);
    expect(checkpoint).toBeGreaterThan(deploy);
    expect(cleanup).toBeGreaterThan(checkpoint);
  });

  it("waits for the exact live candidate version before release checks", () => {
    const waitStart = releaseWorkflow.indexOf("      - name: Wait for the signed candidate");
    const nextStep = releaseWorkflow.indexOf("\n      - name:", waitStart + 1);
    const waitStep = releaseWorkflow.slice(waitStart, nextStep);

    expect(waitStart).toBeGreaterThan(-1);
    expect(waitStep).toContain('jq -e --arg version "$CANDIDATE_VERSION"');
    expect(waitStep).toContain(".version == $version");
    expect(waitStep).toContain("candidate=$CANDIDATE_VERSION&attempt=$attempt");
  });
});
