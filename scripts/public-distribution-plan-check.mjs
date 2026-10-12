import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_DISTRIBUTION_PLAN,
  sha256File,
  validatePublicDistributionPlan,
} from "./public-distribution-plan-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readJson = async (relativePath) =>
  JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );
const [packageJson, releaseManifest, withdrawalReport, plan] =
  await Promise.all([
    readJson("package.json"),
    readJson("output/WeatherPoem_0.2.0_RELEASE.json"),
    readJson(
      "output/WeatherPoem_0.2.0_CONTENT_WITHDRAWAL_DRILL.json",
    ),
    readJson(PUBLIC_DISTRIBUTION_PLAN),
  ]);
const inputs = {
  appVersion: packageJson.version,
  releaseChannel: releaseManifest.channel,
  releaseTrustLevel: releaseManifest.trustLevel,
  artifacts: releaseManifest.artifacts.map((item) => ({
    kind: item.kind,
    name: item.name,
    size: item.size,
    sha256: item.sha256,
    signatureStatus: item.signature.status,
    downloadUrl: item.downloadUrl,
  })),
  allArtifactsSigned: releaseManifest.artifacts.every(
    (item) => item.signature.status === "Valid",
  ),
  allDownloadUrlsConfigured: releaseManifest.artifacts.every(
    (item) =>
      typeof item.downloadUrl === "string" &&
      item.downloadUrl.startsWith("https://"),
  ),
  contentWithdrawalAutomated:
    withdrawalReport.result === "automated-passed",
  hashes: {},
};
for (const [key, relativePath] of Object.entries({
  packageJson: "package.json",
  releaseManifest: "output/WeatherPoem_0.2.0_RELEASE.json",
  checksums: "output/WeatherPoem_0.2.0_SHA256.txt",
  withdrawalReport:
    "output/WeatherPoem_0.2.0_CONTENT_WITHDRAWAL_DRILL.json",
  incidentRunbook: "docs/INCIDENT_RUNBOOK.md",
  releaseTrust: "docs/WINDOWS_RELEASE_TRUST.md",
})) {
  inputs.hashes[key] = {
    path: relativePath,
    sha256: await sha256File(
      path.join(projectRoot, ...relativePath.split("/")),
    ),
  };
}
const summary = validatePublicDistributionPlan(plan, inputs);
console.log(
  `公开分发演练计划有效：${summary.artifactCount} 项发布物、` +
    `${summary.scenarioCount} 个场景、${summary.sequenceStepCount} 个步骤；` +
    "RQT-21 保持 partial，未冒充公开上传或撤回演练。",
);
