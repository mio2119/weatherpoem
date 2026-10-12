import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCompletedReviewCsv } from "./content-review-contract.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const submittedPath = process.argv[2];
if (!submittedPath) {
  console.error(
    "用法：npm run content:review:validate -- <专家回传的CSV绝对路径>",
  );
  process.exit(1);
}

const catalogPath = path.join(
  projectRoot,
  "review",
  "content-review-catalog.json",
);
const [catalogText, csvText] = await Promise.all([
  readFile(catalogPath, "utf8"),
  readFile(path.resolve(submittedPath), "utf8"),
]);
const catalog = JSON.parse(catalogText);
const result = validateCompletedReviewCsv(csvText, catalog);

console.log(
  [
    `审核记录：${result.total} 首`,
    `通过：${result.passed} 首`,
    `需修订：${result.needsRevision} 首`,
    `撤回：${result.retracted} 首`,
    `契约问题：${result.issues.length} 项`,
  ].join("；"),
);

if (result.issues.length > 0) {
  for (const item of result.issues.slice(0, 50)) {
    console.error(`${item.workId}.${item.field}: ${item.message}`);
  }
  if (result.issues.length > 50) {
    console.error(`另有 ${result.issues.length - 50} 项问题未展开。`);
  }
  process.exit(1);
}
if (!result.releaseReady) {
  console.error(
    "审核记录结构完整，但仍有需修订或撤回作品；修订源码并重新导出审核包后再复核。",
  );
  process.exit(2);
}
console.log("具名双人审核记录完整，当前 120 首内容达到权威复核发布门禁。");
