import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  THIRD_PARTY_NOTICE_DRAFT,
  THIRD_PARTY_NOTICE_INDEX,
  collectThirdPartyNoticeInputs,
  validateThirdPartyNoticeDraft,
} from "./third-party-notices-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const [inputs, report, markdown] = await Promise.all([
  collectThirdPartyNoticeInputs(projectRoot),
  readFile(
    path.join(
      projectRoot,
      ...THIRD_PARTY_NOTICE_INDEX.split("/"),
    ),
    "utf8",
  ).then(JSON.parse),
  readFile(
    path.join(
      projectRoot,
      ...THIRD_PARTY_NOTICE_DRAFT.split("/"),
    ),
    "utf8",
  ),
]);
const summary = validateThirdPartyNoticeDraft(
  report,
  markdown,
  inputs,
);

console.log(
  `第三方 NOTICE 草案有效：${summary.npmPackageCount} 个 npm 包、` +
    `${summary.cargoPackageCount} 个 Windows Rust 包、` +
    `${summary.uniqueTextCount} 份去重文本；` +
    `上游文本缺口 npm ${summary.npmMissingTextCount} / ` +
    `Rust ${summary.cargoMissingTextCount}；` +
    `分发文本缺口 npm ${summary.npmDistributionMissingTextCount} / ` +
    `Rust ${summary.cargoDistributionMissingTextCount}；` +
    `规范补充包 ${summary.canonicalFallbackPackageCount}；` +
    `下次构建打包配置已校验，` +
    `未冒充当前安装包已包含或法务批准。`,
);
