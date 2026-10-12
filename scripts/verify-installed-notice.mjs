import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectInstalledNoticeRecord,
  collectNoticeSource,
  mergeInstalledNoticeEvidence,
} from "./installed-notice-support.mjs";
import { collectReleaseState } from "./release-support.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`缺少参数 ${name}`);
  }
  return process.argv[index + 1];
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const kind = argument("--kind");
const installRoot = path.resolve(argument("--install-root"));
const artifactPath = path.resolve(argument("--artifact"));
const requestedEvidencePath = path.resolve(argument("--output"));
const state = await collectReleaseState(projectRoot);
const expectedArtifact = state.artifacts.find(
  (item) => item.kind === kind,
);
if (
  !expectedArtifact ||
  path.resolve(expectedArtifact.absolutePath) !== artifactPath
) {
  throw new Error(`传入的 ${kind} 发布物不是当前发布物`);
}
const noticeSource = await collectNoticeSource(projectRoot);
const evidencePath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${state.version}_INSTALLED_NOTICE.json`,
);
if (requestedEvidencePath !== evidencePath) {
  throw new Error("安装后 NOTICE 证据输出路径不是当前版本的标准路径");
}
const record = await collectInstalledNoticeRecord({
  state,
  noticeSource,
  kind,
  installRoot,
});
let existing = null;
try {
  existing = JSON.parse(
    (await readFile(evidencePath, "utf8")).replace(/^\uFEFF/, ""),
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const report = mergeInstalledNoticeEvidence(existing, {
  state,
  noticeSource,
  record,
});
const temporaryPath =
  `${evidencePath}.${process.pid}.${Date.now()}.tmp`;
await writeFile(
  temporaryPath,
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await rename(temporaryPath, evidencePath);
console.log(
  `${kind.toUpperCase()} 安装后的第三方 NOTICE 已验证；聚合状态：${report.status}`,
);
