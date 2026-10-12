import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCOPE_FREEZE_PROPOSAL,
  validateScopeFreezeProposal,
} from "./scope-freeze-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const [packageJson, traceability, release, pilot, proposal] =
  await Promise.all([
    readJson("package.json"),
    readJson("review/requirements-traceability.json"),
    readJson("output/WeatherPoem_0.2.0_RELEASE.json"),
    readJson("review/pilot-plan.json"),
    readJson(SCOPE_FREEZE_PROPOSAL),
  ]);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );
}

const portable = release.artifacts.find(
  (artifact) => artifact.kind === "portable",
);
validateScopeFreezeProposal(proposal, {
  appVersion: packageJson.version,
  contentVersion: traceability.contentVersion,
  releaseChannel: release.channel,
  trustLevel: release.trustLevel,
  portableSha256: portable.sha256,
  pilot: pilot.audience,
});
console.log(
  "范围冻结提案有效：安全默认试点范围已绑定当前候选；真实责任人、预算与 Go/No-Go 仍待项目发起人批准。",
);
