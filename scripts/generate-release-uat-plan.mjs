import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_UAT_PLAN,
} from "./release-uat-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const [packageJson, traceability, release] = await Promise.all([
  readJson("package.json"),
  readJson("review/requirements-traceability.json"),
  readJson("output/WeatherPoem_0.2.0_RELEASE.json"),
]);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );
}

const scenario = (id, expected, evidenceRequired) => ({
  id,
  required: true,
  expected,
  evidenceRequired,
});

const plan = {
  schemaVersion: "1.0",
  planVersion: "2026.07-non-developer-uat-v1",
  status: "ready-for-human-execution",
  generatedAt: new Date().toISOString(),
  candidate: {
    product: "WeatherPoem",
    appVersion: packageJson.version,
    contentVersion: traceability.contentVersion,
    channel: release.channel,
    trustLevel: release.trustLevel,
    artifacts: release.artifacts.map(
      ({ kind, name, sha256 }) => ({ kind, name, sha256 }),
    ),
  },
  participants: {
    requiredCount: 2,
    mustBeNonDevelopers: true,
    mustUseDedicatedOrCleanAccount: true,
    mustBeNamedInFinalEvidence: true,
  },
  scenarios: [
    scenario(
      "read-trial-warning",
      "Tester understands this is an unsigned controlled trial.",
      ["screenshot", "tester-note"],
    ),
    scenario(
      "nsis-clean-install",
      "NSIS installs without developer assistance.",
      ["installer-log", "installed-version", "screenshot"],
    ),
    scenario(
      "first-run-onboarding",
      "Tester independently chooses city and startup preference.",
      ["screenshot", "tester-note"],
    ),
    scenario(
      "daily-poem-and-reading",
      "Poem card and extended reading are understandable and usable.",
      ["screenshot", "tester-note"],
    ),
    scenario(
      "favorite-feedback-and-replace",
      "Favorite, not-relevant, and once-per-day replacement work.",
      ["screenshot", "tester-note"],
    ),
    scenario(
      "offline-fallback",
      "Core poem experience remains usable without network.",
      ["network-state", "screenshot"],
    ),
    scenario(
      "close-to-tray-and-reopen",
      "Closing hides to tray and tray action restores the window.",
      ["screen-recording-or-timestamps"],
    ),
    scenario(
      "autostart-choice",
      "Startup preference can be enabled and disabled without ambiguity.",
      ["settings-screenshot", "tester-note"],
    ),
    scenario(
      "data-clear",
      "Clear data explains scope and removes user-accessible content.",
      ["before-after-screenshots", "tester-note"],
    ),
    scenario(
      "nsis-uninstall-data-preservation",
      "Uninstall removes program files without silently deleting user data.",
      ["uninstaller-log", "residual-check"],
    ),
    scenario(
      "msi-admin-lifecycle-observation",
      "Approved administrator observes MSI install, repair, and uninstall.",
      ["msi-log", "administrator-note"],
    ),
  ],
  defectPolicy: {
    levels: ["P0", "P1", "P2", "P3"],
    goCondition: "zero-unaccepted-P0-and-P1",
    acceptedExceptionRequires: [
      "defect-id",
      "impact",
      "workaround",
      "owner",
      "deadline",
      "approver",
    ],
  },
  execution: {
    completedParticipantCount: 0,
    executors: [],
    openP0: null,
    openP1: null,
    acceptedExceptions: [],
    completedAt: null,
  },
  approval: {
    qualityOwner: null,
    pilotOwner: null,
    decision: null,
    approvedAt: null,
    evidencePath:
      "review/evidence/RQT-17-defect-signoff-installer-uat.json",
  },
  limitations: {
    humanExecutionCompleted: false,
    defectSignoffCompleted: false,
    namedApprovalCompleted: false,
  },
  gateSatisfied: false,
  result: "execution-plan-ready",
};

const outputPath = path.join(
  projectRoot,
  ...RELEASE_UAT_PLAN.split("/"),
);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(plan, null, 2)}\n`,
  "utf8",
);
console.log(`已生成非开发人员候选版 UAT 计划：${outputPath}`);
