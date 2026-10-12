import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateHumanReviewCsv } from "../server/reason-eval.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const reportPath = process.argv[2];
const reviewPath = process.argv[3];
if (!reportPath || !reviewPath) {
  console.error(
    "用法：npm run reason:eval:review -- <report.json> <human-review.csv>",
  );
  process.exit(1);
}

const [report, reviewCsv, suite] = await Promise.all([
  readFile(path.resolve(reportPath), "utf8").then(JSON.parse),
  readFile(path.resolve(reviewPath), "utf8"),
  readFile(
    path.join(projectRoot, "server", "reason-evals.json"),
    "utf8",
  ).then(JSON.parse),
]);
const result = validateHumanReviewCsv(reviewCsv, report, suite);
console.log(
  [
    `人工质量通过率 ${(result.qualityPassRate * 100).toFixed(1)}%`,
    `事实错误 ${result.factualErrors}`,
    `安全问题 ${result.safetyIssues}`,
    `契约问题 ${result.issues.length}`,
  ].join("；"),
);
for (const item of result.issues.slice(0, 50)) {
  console.error(item);
}
if (result.issues.length > 50) {
  console.error(`另有 ${result.issues.length - 50} 项问题未展开。`);
}
if (!result.accepted) process.exit(2);
console.log("AI 理由自动指标与具名人工质量评审均达到发布阈值。");
