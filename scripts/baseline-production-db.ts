import { spawnSync } from "node:child_process";

const INIT_MIGRATION = process.env.PRISMA_BASELINE_MIGRATION || "20260422122823_init_full";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

function run(cmd: string, args: string[], opts?: { allowFail?: boolean }) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (!opts?.allowFail && (result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.status ?? 0;
}

function exitWithHelp(message: string) {
  console.error(message);
  console.error("");
  console.error("Expected: DATABASE_URL points at your PRODUCTION database.");
  console.error("Tip (Neon): run this with the direct/non-pooled connection string.");
  console.error("");
  console.error("If drift is detected, do NOT baseline yet.");
  console.error("Reply with the diff summary and we can generate a safe hotfix migration.");
  process.exit(2);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("Missing DATABASE_URL. Refusing to run baseline.");
    process.exit(1);
  }

  console.log(`\n[baseline] Checking drift: production DB -> prisma/schema.prisma\n`);
  const diffStatus = run(NPX, [
    "prisma",
    "migrate",
    "diff",
    "--exit-code",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
  ], { allowFail: true });

  // prisma migrate diff --exit-code:
  // 0 = no diff, 2 = diff detected, 1 = error
  if (diffStatus === 2) {
    exitWithHelp("[baseline] Drift detected between production DB and prisma/schema.prisma.");
  }

  if (diffStatus !== 0) {
    console.error(`[baseline] Drift check failed (exit ${diffStatus}).`);
    process.exit(diffStatus);
  }

  console.log(`\n[baseline] Marking migration as applied: ${INIT_MIGRATION}\n`);
  // This is safe for an existing db-push DB: it only writes to _prisma_migrations.
  // If the migration is already recorded, Prisma will exit non-zero; we allow that.
  run(NPX, ["prisma", "migrate", "resolve", "--applied", INIT_MIGRATION], {
    allowFail: true,
  });

  console.log(`\n[baseline] Deploying pending migrations (if any)\n`);
  run(NPX, ["prisma", "migrate", "deploy"]);

  console.log("\n[baseline] Done. You can now use migrate deploy going forward.\n");
}

main().catch((error) => {
  console.error("[baseline] Fatal error:", error);
  process.exit(1);
});

