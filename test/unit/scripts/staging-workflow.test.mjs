import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../.github/workflows/staging-e2e.yml", import.meta.url),
  "utf8"
);
const releaseWorkflow = readFileSync(
  new URL("../../../.github/workflows/release.yml", import.meta.url),
  "utf8"
);
const publicUpgradeWorkflow = readFileSync(
  new URL("../../../.github/workflows/public-upgrade.yml", import.meta.url),
  "utf8"
);
const migrationCount = (directory) =>
  readdirSync(new URL(`../../../${directory}/`, import.meta.url)).filter((name) =>
    name.endsWith(".sql")
  ).length;

describe("staging workflow lifecycle record", () => {
  it("verifies and records older public source deployments before preparing their update", () => {
    const install = publicUpgradeWorkflow.indexOf("      - name: Install the source release");
    const record = publicUpgradeWorkflow.indexOf(
      "      - name: Verify and record the source Worker deployment"
    );
    const seed = publicUpgradeWorkflow.indexOf(
      "      - name: Create persistent source-version data"
    );
    const prepare = publicUpgradeWorkflow.indexOf(
      "      - name: Prepare a public upgrade trigger and signed discovery fixture"
    );
    const checkpoint = publicUpgradeWorkflow.slice(record, seed);
    expect(install).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(install);
    expect(seed).toBeGreaterThan(record);
    expect(prepare).toBeGreaterThan(seed);
    expect(checkpoint).toContain('jq -e --arg version "$SOURCE_VERSION"');
    expect(checkpoint).toContain(".ok == true and .version == $version");
    expect(checkpoint).toContain("--connect-timeout 2 --max-time 5");
    expect(checkpoint).toContain("source_deadline=$((SECONDS + 300))");
    expect(checkpoint).toContain('test "$SECONDS" -ge "$source_deadline"');
    expect(checkpoint).toContain("recordWorkerDeployedForConfig");
    expect(checkpoint).toContain("manifest?.worker?.deployed !== true");
  });

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
    const afterSchemaAssertion = workflow.indexOf('"schema_version":4');
    const finalAssertion = workflow.indexOf('"post_migration_count":4');
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
    expect(workflow).toContain('"draft_content_id_column_count":1');
    expect(workflow).toContain('"disconnected_at":null');
    expect(workflow).toContain(`"migration_count":${migrationCount("migrations")}`);
    expect(workflow).toContain('"from_name":null');
    expect(workflow).toContain(
      `"post_migration_count":${migrationCount("migrations-after-deploy")}`
    );
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

  it("uses the oldest supported updater for the previous release and candidate", () => {
    const previousRelease = releaseWorkflow.indexOf(
      "      - name: Install the previous stable release with the oldest supported updater"
    );
    const bootstrapData = releaseWorkflow.indexOf(
      "      - name: Bootstrap persistent N-1 staging data"
    );
    const oauth = releaseWorkflow.indexOf(
      "      - name: Configure customer OAuth for the candidate"
    );
    const legacyConfig = releaseWorkflow.indexOf(
      "      - name: Reproduce the legacy Worker configuration"
    );
    const candidate = releaseWorkflow.indexOf("      - name: Apply the exact signed candidate");
    const candidateWait = releaseWorkflow.indexOf("      - name: Wait for the signed candidate");
    const previousInstall = releaseWorkflow.slice(previousRelease, bootstrapData);
    const candidateInstall = releaseWorkflow.slice(candidate, candidateWait);
    const workersCiAssignment = "WORKERS_CI=1 \\";

    expect(previousRelease).toBeGreaterThan(-1);
    expect(bootstrapData).toBeGreaterThan(previousRelease);
    expect(oauth).toBeGreaterThan(bootstrapData);
    expect(legacyConfig).toBeGreaterThan(oauth);
    expect(candidate).toBeGreaterThan(legacyConfig);
    expect(releaseWorkflow).toContain("OLDEST_UPDATER_TAG: v1.0.0");
    expect(releaseWorkflow.slice(legacyConfig, candidate)).toContain(
      "delete config.durable_objects"
    );
    expect(releaseWorkflow.slice(legacyConfig, candidate)).toContain("delete config.migrations");
    expect(releaseWorkflow).toContain(
      'oldest_deployment="$oldest_source/.hqbase/deployments/$DEPLOYMENT_NAME"'
    );
    expect(releaseWorkflow).toContain(
      'ln -s "$GITHUB_WORKSPACE/.hqbase/deployments/$DEPLOYMENT_NAME" "$oldest_deployment"'
    );
    expect(releaseWorkflow).toContain('oldest_config="$oldest_deployment/wrangler.jsonc"');
    expect(releaseWorkflow).toContain('node "$oldest_updater" --config "$oldest_config"');
    expect(releaseWorkflow).toContain(
      'node "$HQBASE_OLDEST_UPDATER" --config "$HQBASE_OLDEST_CONFIG"'
    );
    expect(previousInstall.split("\n").map((line) => line.trim())).toContain(workersCiAssignment);
    expect(candidateInstall.split("\n").map((line) => line.trim())).toContain(workersCiAssignment);
  });

  it("isolates and cleans the signed-release staging Worker", () => {
    const create = releaseWorkflow.indexOf("      - name: Create disposable customer resources");
    const cleanup = releaseWorkflow.indexOf(
      "      - name: Reconcile disposable Worker lifecycle record"
    );
    const upload = releaseWorkflow.indexOf("      - name: Upload non-secret deployment record");
    const destroy = releaseWorkflow.indexOf("      - name: Destroy disposable resources");
    const cleanupStep = releaseWorkflow.slice(cleanup, upload);
    const destroyStep = releaseWorkflow.slice(destroy, releaseWorkflow.indexOf("\n\n", destroy));
    const inspectWorker = cleanupStep.indexOf("wrangler deployments status");
    const recordWorker = cleanupStep.indexOf("recordWorkerDeployedForConfig");
    const emptyWorker = cleanupStep.indexOf("The Worker $worker_name has no deployments.");
    const deleteWorker = cleanupStep.indexOf('wrangler delete "$worker_name"');

    expect(releaseWorkflow).toMatch(
      /STAGING_WORKER_NAME: hqbase-release-\$\{\{ github\.run_id \}\}/
    );
    expect(releaseWorkflow).toContain('--worker-name "$STAGING_WORKER_NAME"');
    expect(releaseWorkflow.match(/--name "\$STAGING_WORKER_NAME"/g)).toHaveLength(4);
    expect(releaseWorkflow).not.toContain("hqbase-e2e-staging");
    expect(cleanup).toBeGreaterThan(create);
    expect(upload).toBeGreaterThan(cleanup);
    expect(destroy).toBeGreaterThan(upload);
    expect(cleanupStep).toContain("if: always()");
    expect(cleanupStep).toContain("id: reconcile_worker");
    expect(cleanupStep).toContain('echo "manifest_present=false" >> "$GITHUB_OUTPUT"');
    expect(cleanupStep).toContain('echo "manifest_present=true" >> "$GITHUB_OUTPUT"');
    expect(cleanupStep).toContain('manifest=".hqbase/deployments/$DEPLOYMENT_NAME/manifest.json"');
    expect(cleanupStep).toContain(`worker_name="$(jq -er '.worker.name' "$manifest")"`);
    expect(cleanupStep).toContain(`worker_deployed="$(jq -r '.worker.deployed' "$manifest")"`);
    expect(cleanupStep).toContain('test "$worker_name" = "$STAGING_WORKER_NAME"');
    expect(cleanupStep).toContain('case "$worker_deployed" in');
    expect(cleanupStep).toContain("true) exit 0 ;;");
    expect(cleanupStep).toContain("false) ;;");
    expect(cleanupStep).toContain("Invalid Worker deployment state.");
    expect(inspectWorker).toBeGreaterThan(-1);
    expect(recordWorker).toBeGreaterThan(inspectWorker);
    expect(emptyWorker).toBeGreaterThan(inspectWorker);
    expect(deleteWorker).toBeGreaterThan(emptyWorker);
    expect(cleanupStep).toContain("This Worker does not exist on your account.");
    expect(cleanupStep).toContain("exit 1");
    expect(destroyStep).toContain("steps.reconcile_worker.outcome == 'success'");
    expect(destroyStep).toContain("steps.reconcile_worker.outputs.manifest_present == 'true'");
  });

  it("serializes workflows that own the protected staging hostname", () => {
    expect(workflow).toContain("group: hqbase-staging-resources");
    expect(workflow).toContain("queue: max");
    expect(releaseWorkflow).toContain("group: hqbase-staging-resources");
    expect(releaseWorkflow).toContain("queue: max");
  });

  it("proves the stale state before the canonical repair and its retry", () => {
    const candidate = releaseWorkflow.indexOf("      - name: Apply the exact signed candidate");
    const stale = releaseWorkflow.indexOf(
      "      - name: Verify the candidate restored the binding while the database remained at S0"
    );
    const repair = releaseWorkflow.indexOf(
      "      - name: Finish the candidate through its canonical signed bootstrap"
    );
    const final = releaseWorkflow.indexOf(
      "      - name: Verify exact migration ledgers, final schema, and preserved data"
    );
    const retry = releaseWorkflow.indexOf(
      "      - name: Prove the canonical same-version retry is idempotent"
    );
    const bindings = releaseWorkflow.indexOf("      - name: Verify active Worker bindings");
    const resetSignInProbes = releaseWorkflow.indexOf(
      "      - name: Reset disposable sign-in probes before final lifecycle"
    );
    const lifecycle = releaseWorkflow.indexOf(
      "      - name: Verify PWA, app shell, access, and operator lifecycle"
    );
    const backup = releaseWorkflow.indexOf(
      "      - name: Exercise populated remote backup and restore"
    );

    expect(candidate).toBeGreaterThan(-1);
    expect(stale).toBeGreaterThan(candidate);
    expect(repair).toBeGreaterThan(stale);
    expect(final).toBeGreaterThan(repair);
    expect(retry).toBeGreaterThan(final);
    expect(bindings).toBeGreaterThan(retry);
    expect(resetSignInProbes).toBeGreaterThan(bindings);
    expect(lifecycle).toBeGreaterThan(resetSignInProbes);
    expect(backup).toBeGreaterThan(lifecycle);
    expect(releaseWorkflow.slice(stale, repair)).toContain("after_deploy_ledger_table_count:0");
    expect(releaseWorkflow.slice(stale, repair)).toContain("alias_table_count:2");
    expect(releaseWorkflow.slice(stale, repair)).toContain("transition_guard_count:11");
    expect(releaseWorkflow.slice(stale, repair)).toContain('index("MAIL_EVENTS") != null');
    expect(releaseWorkflow.slice(stale, repair)).toContain("pnpm test:e2e:staging:event-socket");
    expect(releaseWorkflow.slice(repair, final)).toContain(
      'node "$GITHUB_WORKSPACE/scripts/release/bootstrap.mjs" --config "$config"'
    );
    expect(releaseWorkflow.slice(final, retry)).toContain(
      "SELECT name FROM d1_migrations ORDER BY id"
    );
    expect(releaseWorkflow.slice(final, retry)).toContain(
      "SELECT name FROM d1_migrations_after_deploy ORDER BY id"
    );
    expect(releaseWorkflow.slice(final, retry)).toContain("repair_history_count:1");
    expect(releaseWorkflow.slice(final, retry)).toContain("PRAGMA foreign_key_check");
    expect(releaseWorkflow.slice(final, retry)).toContain("hqbase-pre-repair-data.json");
    expect(releaseWorkflow.slice(retry, bindings)).toContain(
      'node "$GITHUB_WORKSPACE/scripts/release/bootstrap.mjs" --config "$config"'
    );
    expect(releaseWorkflow.slice(resetSignInProbes, lifecycle)).toContain(
      "DELETE FROM rate_limits WHERE scope IN ('auth.email', 'auth.ip')"
    );
  });

  it("gates publication on the deployed update action and exact cleanup", () => {
    const waitPrevious = releaseWorkflow.indexOf(
      "      - name: Wait for the previous stable release"
    );
    const recordPrevious = releaseWorkflow.indexOf(
      "      - name: Record the previous stable Worker deployment"
    );
    const prepare = releaseWorkflow.indexOf(
      "      - name: Prepare the deployed update-action release gate"
    );
    const candidate = releaseWorkflow.indexOf("      - name: Apply the exact signed candidate");
    const stale = releaseWorkflow.indexOf(
      "      - name: Verify the candidate restored the binding while the database remained at S0"
    );
    const probe = releaseWorkflow.indexOf(
      "      - name: Exercise the deployed update action without deployment"
    );
    const repair = releaseWorkflow.indexOf(
      "      - name: Finish the candidate through its canonical signed bootstrap"
    );
    const cleanup = releaseWorkflow.indexOf(
      "      - name: Reconcile deployed update-action gate resources"
    );
    const upload = releaseWorkflow.indexOf("      - name: Upload non-secret deployment record");

    expect(waitPrevious).toBeGreaterThan(-1);
    expect(recordPrevious).toBeGreaterThan(waitPrevious);
    expect(prepare).toBeGreaterThan(recordPrevious);
    expect(candidate).toBeGreaterThan(prepare);
    expect(stale).toBeGreaterThan(candidate);
    expect(probe).toBeGreaterThan(stale);
    expect(repair).toBeGreaterThan(probe);
    expect(cleanup).toBeGreaterThan(repair);
    expect(upload).toBeGreaterThan(cleanup);
    expect(releaseWorkflow).toContain("HQBASE_E2E_REPO_CONNECTION_UUID:");
    expect(releaseWorkflow).toContain("HQBASE_E2E_BUILD_TOKEN_UUID:");
    expect(releaseWorkflow).toContain("HQBASE_E2E_UPDATE_API_TOKEN:");
    expect(releaseWorkflow).toContain("staging-update-gate.mjs prepare");
    expect(releaseWorkflow).toContain("staging-update-gate.mjs probe");
    expect(releaseWorkflow).toContain("staging-update-gate.mjs cleanup");
    expect(releaseWorkflow).toContain("steps.reconcile_update_gate.outcome == 'success'");
    expect(releaseWorkflow.slice(recordPrevious, prepare)).toContain(
      "recordWorkerDeployedForConfig"
    );
  });

  it("keeps the customer source checkout unchanged", () => {
    expect(releaseWorkflow).toContain(
      "      - name: Verify the customer source checkout starts unchanged"
    );
    expect(releaseWorkflow).toContain(
      "      - name: Verify the customer source checkout stayed unchanged"
    );
    expect(releaseWorkflow.match(/git diff --quiet/g)).toHaveLength(2);
    expect(releaseWorkflow.match(/git diff --cached --quiet/g)).toHaveLength(2);
    expect(releaseWorkflow.match(/git ls-files --others --exclude-standard/g)).toHaveLength(2);
  });

  it("publishes Nightly separately from stable promotion", () => {
    const publish = releaseWorkflow.slice(
      releaseWorkflow.indexOf("  publish:"),
      releaseWorkflow.indexOf("  cleanup-failed-draft:")
    );
    expect(publish).toContain("node scripts/release/channels.mjs publish");
    expect(publish).not.toContain("git/refs/heads/deploy");
    expect(publish).not.toContain("--latest");
    const draft = releaseWorkflow.slice(
      releaseWorkflow.indexOf("      - name: Create draft GitHub Release"),
      releaseWorkflow.indexOf("  staging:")
    );
    expect(draft).not.toContain('"release/stable.json"');
    expect(draft).toContain('"release/nightly.json"');
    const promotion = readFileSync(
      new URL("../../../.github/workflows/promote-stable.yml", import.meta.url),
      "utf8"
    );
    expect(promotion).toContain("environment: release");
    expect(promotion).toContain("node scripts/release/channels.mjs promote");
    expect(promotion).not.toContain("release:package");
  });
});
