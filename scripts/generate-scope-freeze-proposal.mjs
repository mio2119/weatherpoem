import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCOPE_FREEZE_PROPOSAL,
} from "./scope-freeze-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const [packageJson, traceability, release, pilot] =
  await Promise.all([
    readJson("package.json"),
    readJson("review/requirements-traceability.json"),
    readJson("output/WeatherPoem_0.2.0_RELEASE.json"),
    readJson("review/pilot-plan.json"),
  ]);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );
}

const portable = release.artifacts.find(
  (artifact) => artifact.kind === "portable",
);
if (!portable) {
  throw new Error("Release manifest has no portable candidate.");
}

const proposal = {
  schemaVersion: "1.0",
  proposalVersion: "2026.07-safe-pilot-v1",
  status: "proposal-ready-not-approved",
  generatedAt: new Date().toISOString(),
  candidate: {
    product: "WeatherPoem",
    appVersion: packageJson.version,
    contentVersion: traceability.contentVersion,
    ruleVersion: traceability.contentVersion,
    releaseChannel: release.channel,
    trustLevel: release.trustLevel,
    portableSha256: portable.sha256,
  },
  distribution: {
    currentAllowedScope: [
      "internal-demonstration",
      "controlled-internal-testing",
    ],
    campusPilotAllowedAfterRequiredGates: true,
    publicDistributionAllowed: false,
    downloadUrl: null,
    platforms: ["windows-x64"],
  },
  pilot: {
    minimumParticipants: pilot.audience.minimumParticipants,
    maximumParticipants: pilot.audience.maximumParticipants,
    minimumAge: pilot.audience.minimumAge,
    durationDays: pilot.retention.recordingDays,
    recruitmentStarted: false,
    requiresSeparateConsent: true,
  },
  onlineCapabilities: {
    weather:
      "open-meteo-best-effort-with-cache-and-offline-fallback",
    aiReason: "local-rules-only-until-production-gate",
    officialWarning:
      "disabled-until-authorized-gateway-and-csp-gate",
    pilotTelemetry:
      "local-daily-and-session-aggregate-manual-export-v2-separate-opt-in",
    clientSecrets: "none",
  },
  budget: {
    paidAiEnabled: false,
    paidAiMonthlyCapCny: 0,
    otherPaidServiceMonthlyCapCny: 0,
    budgetOwner: null,
    changeRequiresSignedApproval: true,
  },
  rollback: {
    binary: "manual-reinstall-last-approved-build",
    content:
      "signed-off-withdrawal-manifest-or-global-suspension",
    onlineEnhancements:
      "disable-endpoint-and-fall-back-to-local-rules",
    rollbackOwnerRole: "发布负责人",
    secondApproverRole: "安全或内容负责人",
  },
  responsibilities: {
    projectSponsor: { role: "项目发起人", name: null },
    pilotOwner: { role: "试点负责人", name: null },
    releaseOwner: { role: "发布负责人", name: null },
    rollbackOwner: { role: "回滚负责人", name: null },
    contentReviewer: { role: "内容审核负责人", name: null },
    securityPrivacyOwner: {
      role: "安全与隐私负责人",
      name: null,
    },
    qualityOwner: { role: "质量负责人", name: null },
  },
  approval: {
    projectSponsorName: null,
    decision: null,
    decidedAt: null,
    evidencePath:
      "review/evidence/RQT-18-scope-ai-version-freeze.json",
  },
  limitations: {
    namedPeopleAssigned: false,
    budgetApproved: false,
    goNoGoHeld: false,
    campusPilotAuthorized: false,
    publicReleaseAuthorized: false,
  },
  gateSatisfied: false,
  result: "safe-default-proposal-ready",
};

const outputPath = path.join(
  projectRoot,
  ...SCOPE_FREEZE_PROPOSAL.split("/"),
);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(proposal, null, 2)}\n`,
  "utf8",
);
console.log(`已生成安全默认范围冻结提案：${outputPath}`);
