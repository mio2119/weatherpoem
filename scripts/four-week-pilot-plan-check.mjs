import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FOUR_WEEK_PILOT_PLAN,
  sha256File,
  validateFourWeekPilotPlan,
} from "./four-week-pilot-plan-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readJson = async (relativePath) =>
  JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );
const [packageJson, catalog, readiness, releaseManifest, plan] =
  await Promise.all([
    readJson("package.json"),
    readJson("review/content-review-catalog.json"),
    readJson("output/WeatherPoem_0.2.0_READINESS.json"),
    readJson("output/WeatherPoem_0.2.0_RELEASE.json"),
    readJson(FOUR_WEEK_PILOT_PLAN),
  ]);
const campus = readiness.milestones.find(
  (item) => item.id === "campus-pilot",
);
const portable = releaseManifest.artifacts.find(
  (item) => item.kind === "portable",
);
const inputs = {
  appVersion: packageJson.version,
  contentVersion: catalog.contentVersion,
  ruleVersion: "rules-2026.07-v1",
  portableSha256: portable.sha256,
  campusPilotStatus: campus.status,
  passedGateCount: campus.passedGateCount,
  requiredGateCount: campus.requiredGateCount,
  blockingGateIds: campus.blockingGates.map((item) => item.id),
  hashes: {},
};
for (const [key, relativePath] of Object.entries({
  packageJson: "package.json",
  contentCatalog: "review/content-review-catalog.json",
  readiness: "output/WeatherPoem_0.2.0_READINESS.json",
  pilotPlan: "review/pilot-plan.json",
  pilotImplementation: "src/core/pilot.ts",
  scopeFreeze: "review/scope-freeze-proposal.json",
  releaseManifest: "output/WeatherPoem_0.2.0_RELEASE.json",
})) {
  inputs.hashes[key] = {
    path: relativePath,
    sha256: await sha256File(
      path.join(projectRoot, ...relativePath.split("/")),
    ),
  };
}
const summary = validateFourWeekPilotPlan(plan, inputs);
console.log(
  `四周试点执行包有效：${summary.metricCount} 项指标、` +
    `${summary.timelineStageCount} 个阶段；校园入口仍有 ` +
    `${summary.blockingGateCount} 项门禁，RQT-22 保持 partial。`,
);
