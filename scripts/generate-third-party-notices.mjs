import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  THIRD_PARTY_NOTICE_DRAFT,
  THIRD_PARTY_NOTICE_INDEX,
  buildThirdPartyNoticeDraft,
  collectThirdPartyNoticeInputs,
  validateThirdPartyNoticeDraft,
} from "./third-party-notices-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const inputs = await collectThirdPartyNoticeInputs(projectRoot);
const { report, markdown } = buildThirdPartyNoticeDraft(
  inputs,
  new Date().toISOString(),
);
const summary = validateThirdPartyNoticeDraft(
  report,
  markdown,
  inputs,
);

await writeFile(
  path.join(
    projectRoot,
    ...THIRD_PARTY_NOTICE_DRAFT.split("/"),
  ),
  markdown,
  "utf8",
);
await writeFile(
  path.join(
    projectRoot,
    ...THIRD_PARTY_NOTICE_INDEX.split("/"),
  ),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

console.log(
  `第三方 NOTICE 草案已生成：${summary.npmPackageCount} 个 npm 包、` +
    `${summary.cargoPackageCount} 个 Windows Rust 包、` +
    `${summary.uniqueTextCount} 份去重许可文本；` +
    `上游文本缺口 npm ${summary.npmMissingTextCount} / ` +
    `Rust ${summary.cargoMissingTextCount}；` +
    `分发文本缺口 npm ${summary.npmDistributionMissingTextCount} / ` +
    `Rust ${summary.cargoDistributionMissingTextCount}；` +
    `规范补充包 ${summary.canonicalFallbackPackageCount}；` +
    "下次构建打包配置已就绪；当前安装包验证与具名法务复核尚未完成。",
);
