import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertInstalledNoticeEvidence,
  collectNoticeSource,
} from "./installed-notice-support.mjs";
import { collectReleaseState } from "./release-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const state = await collectReleaseState(projectRoot);
const noticeSource = await collectNoticeSource(projectRoot);
const evidencePath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${state.version}_INSTALLED_NOTICE.json`,
);
let report;
try {
  report = JSON.parse(
    (await readFile(evidencePath, "utf8")).replace(/^\uFEFF/, ""),
  );
} catch (error) {
  if (error?.code === "ENOENT") {
    throw new Error(
      `安装后 NOTICE 证据缺失：请先完成 NSIS 与 MSI 真实安装验证并生成 ${path.basename(evidencePath)}`,
    );
  }
  throw error;
}
assertInstalledNoticeEvidence(report, {
  state,
  noticeSource,
});
console.log(
  `安装后 NOTICE 证据有效：WeatherPoem ${state.version}，NSIS 与 MSI 均与当前 NOTICE 字节一致`,
);
