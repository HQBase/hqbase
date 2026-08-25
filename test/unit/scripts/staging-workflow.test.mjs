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
const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

describe("staging workflow lifecycle record", () => {
  it("tests a populated two-phase SQL cutover around deployment", () => {
    const legacy = workflow.indexOf('set_migrations_dir "migrations-before-0014"');
    const current = workflow.indexOf('set_migrations_dir "../../../migrations"');
    const beforeDeployAssertion = workflow.indexOf('"alias_table_count":1');
    const beforeAddressIdAssertion = workflow.indexOf('"address_id_column_count":2');
    const beforeSchemaAssertion = workflow.indexOf('"schema_version":2');
    const deployStep = workflow.indexOf("      - name: Deploy reviewed source candidate");
    const deploy = workflow.indexOf("pnpm exec wrangler deploy --config");
    const afterDeployDirectory = workflow.indexOf('"../../../migrations-after-deploy"');
    const afterAliasAssertion = workflow.indexOf('"alias_table_count":0');
    const afterAddressIdAssertion = workflow.indexOf('"address_id_column_count":0');
    const afterSchemaAssertion = workflow.indexOf('"schema_version":3');
    const finalAssertion = workflow.indexOf('"post_migration_count":2');
    const cleanup = workflow.indexOf(
      "DELETE FROM messages WHERE id IN ('msg_sql_upgrade', 'msg_sql_alias_upgrade')"
    );
    const lifecycle = workflow.indexOf("pnpm test:e2e:staging");
    const normalUpgrade = workflow.slice(current, deployStep);
    const afterDeployUpgrade = workflow.slice(afterDeployDirectory, finalAssertion);

    expect(legacy).toBeGreaterThan(-1);
    expect(current).toBeGreaterThan(legacy);
    expect(beforeDeployAssertion).toBeGreaterThan(current);
    expect(beforeAddressIdAssertion).toBeGreaterThan(current);
    expect(beforeSchemaAssertion).toBeGreaterThan(current);
    expect(deployStep).toBeGreaterThan(beforeDeployAssertion);
    expect(deployStep).toBeGreaterThan(beforeAddressIdAssertion);
    expect(deployStep).toBeGreaterThan(beforeSchemaAssertion);
    expect(deploy).toBeGreaterThan(deployStep);
    expect(afterDeployDirectory).toBeGreaterThan(deploy);
    expect(afterAliasAssertion).toBeGreaterThan(afterDeployDirectory);
    expect(afterAddressIdAssertion).toBeGreaterThan(afterDeployDirectory);
    expect(afterSchemaAssertion).toBeGreaterThan(afterDeployDirectory);
    expect(finalAssertion).toBeGreaterThan(afterDeployDirectory);
    expect(cleanup).toBeGreaterThan(finalAssertion);
    expect(lifecycle).toBeGreaterThan(cleanup);
    expect(workflow).toContain("sql-upgrade-probe");
    expect(workflow).toContain("msg_sql_upgrade");
    expect(workflow).toContain("msg_sql_alias_upgrade");
    expect(workflow).toContain("mbx_migrated_addr_sql_upgrade_alias");
    expect(workflow).toContain('"$(basename "$migration")" < "0014_"');
    expect(workflow).toContain('"is_unassigned":1');
    expect(workflow).toContain('"delivered_to_address":"alias@sql-upgrade.example.test"');
    expect(workflow).toContain('"migration_count":23');
    expect(workflow).toContain('"from_name":null');
    expect(workflow).toContain('"post_migration_count":2');
    expect(workflow).toContain('migrations_table = "d1_migrations_after_deploy"');
    expect(workflow).toContain("del(.d1_databases[0].migrations_pattern)");
    expect(normalUpgrade.match(/migrations apply DB --remote --config "\$config"/g)).toHaveLength(
      2
    );
    expect(
      afterDeployUpgrade.match(/migrations apply DB --remote --config "\$after_deploy_config"/g)
    ).toHaveLength(2);
    expect(workflow).toContain("fixture_row_count == 0");
  });

  it("records the reviewed Worker deploy before cleanup", () => {
    const deploy = workflow.indexOf("pnpm exec wrangler deploy --config");
    const checkpoint = workflow.indexOf("recordWorkerDeployedForConfig");
    const cleanup = workflow.indexOf('pnpm hqbase destroy --name "$DEPLOYMENT_NAME"');

    expect(deploy).toBeGreaterThan(-1);
    expect(checkpoint).toBeGreaterThan(deploy);
    expect(cleanup).toBeGreaterThan(checkpoint);
  });

  it("moves the live portal to a second hostname and back", () => {
    const lifecycle = workflow.indexOf("pnpm test:e2e:staging");
    const move = workflow.indexOf("node scripts/test-domain-staging.mjs");
    const recovery = workflow.indexOf("node scripts/test-domain-staging.mjs --cleanup-only");
    const backup = workflow.indexOf("Exercise populated remote backup and restore");
    const destroy = workflow.indexOf('pnpm hqbase destroy --name "$DEPLOYMENT_NAME"');

    expect(lifecycle).toBeGreaterThan(-1);
    expect(move).toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(-1);
    expect(backup).toBeGreaterThan(-1);
    expect(destroy).toBeGreaterThan(-1);
    expect(move).toBeGreaterThan(lifecycle);
    expect(recovery).toBeGreaterThan(move);
    expect(backup).toBeGreaterThan(recovery);
    expect(destroy).toBeGreaterThan(recovery);
    expect(workflow).toContain("HQBASE_DOMAIN_API_TOKEN:");
    expect(workflow).toContain("HQBASE_DOMAIN_ACCESS_CLIENT_ID:");
    expect(workflow).toContain("HQBASE_DOMAIN_ACCESS_CLIENT_SECRET:");
    expect(workflow).toContain("HQBASE_DOMAIN_MOVE_HOST:");
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

  it("moves the Deploy Button source before publication and verifies the exact commit", () => {
    const readSource = releaseWorkflow.indexOf("Read current Deploy Button source");
    const verifyTag = releaseWorkflow.indexOf("Verify any existing release tag source");
    const advance = releaseWorkflow.indexOf("Advance Deploy Button source to validated candidate");
    const publish = releaseWorkflow.indexOf("Publish the validated draft");
    const restore = releaseWorkflow.indexOf(
      "Restore Deploy Button source after publication failure"
    );
    const verify = releaseWorkflow.indexOf("Verify public stable asset, signature, and digest");

    expect(readSource).toBeGreaterThan(-1);
    expect(verifyTag).toBeGreaterThan(readSource);
    expect(advance).toBeGreaterThan(verifyTag);
    expect(publish).toBeGreaterThan(advance);
    expect(restore).toBeGreaterThan(publish);
    expect(verify).toBeGreaterThan(restore);
    expect(releaseWorkflow).toContain("RELEASE_COMMIT: \u0024{{ needs.candidate.outputs.commit }}");
    expect(releaseWorkflow).toContain("git/refs/heads/deploy");
    expect(releaseWorkflow).toContain("git/matching-refs/tags/$tag_name");
    expect(releaseWorkflow).toContain("git/tags/$tag_commit");
    expect(releaseWorkflow).toContain("steps.publish_release.outcome == 'failure'");
    expect(releaseWorkflow).toContain("--json isDraft --jq .isDraft");
    expect(releaseWorkflow).toContain("release_lookup_succeeded=false");
    expect(releaseWorkflow).toContain('test "$release_lookup_succeeded" != "true"');
    expect(releaseWorkflow).toContain('test "$release_is_draft" = "false"');
    expect(releaseWorkflow).toContain("-F force=true");
    expect(releaseWorkflow).toContain('test "$tag_commit" = "$RELEASE_COMMIT"');
    expect(releaseWorkflow).toContain('test "$deploy_commit" = "$RELEASE_COMMIT"');
    expect(readme).toContain("HQBase%2Fhqbase%2Ftree%2Fdeploy");
  });
});
