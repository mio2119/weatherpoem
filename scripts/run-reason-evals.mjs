import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHumanReviewCsv,
  createHttpReasonRequester,
  runReasonEvalSuite,
} from "../server/reason-eval.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const endpoint = argument("--url") ?? process.env.REASON_EVAL_URL;
const origin =
  argument("--origin") ?? process.env.REASON_EVAL_ORIGIN;
const repetitions = Number(argument("--repetitions") ?? 1);
const concurrency = Number(argument("--concurrency") ?? 2);
const timeoutMs = Number(argument("--timeout-ms") ?? 2500);
if (!endpoint || !origin) {
  console.error(
    "必须通过 --url 和 --origin 指定已部署的理由服务与精确允许来源。",
  );
  process.exit(1);
}

const [suite, catalog] = await Promise.all([
  readFile(
    path.join(projectRoot, "server", "reason-evals.json"),
    "utf8",
  ).then(JSON.parse),
  readFile(
    path.join(projectRoot, "server", "reason-catalog.json"),
    "utf8",
  ).then(JSON.parse),
]);
const requester = createHttpReasonRequester({
  endpoint,
  origin,
  timeoutMs,
});
const serviceOrigin = new URL(endpoint).origin;
const report = await runReasonEvalSuite({
  suite,
  catalog,
  requester,
  repetitions,
  concurrency,
  serviceOrigin,
});

const timestamp = new Date()
  .toISOString()
  .replaceAll(":", "")
  .replaceAll(".", "-");
const outputDirectory =
  argument("--output") ??
  path.join(projectRoot, "output", "reason-evals", timestamp);
await mkdir(outputDirectory, { recursive: true });
const reportPath = path.join(outputDirectory, "report.json");
const reviewPath = path.join(outputDirectory, "human-review.csv");
await Promise.all([
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(reviewPath, buildHumanReviewCsv(report), "utf8"),
]);

console.log(
  [
    `总请求 ${report.metrics.total}`,
    `契约通过 ${report.metrics.passed}`,
    `P50 ${report.metrics.p50LatencyMs}ms`,
    `P95 ${report.metrics.p95LatencyMs}ms`,
    `自动门禁 ${report.automatedAccepted ? "通过" : "失败"}`,
  ].join("；"),
);
console.log(`运行报告：${reportPath}`);
console.log(`人工评分表：${reviewPath}`);
if (!report.automatedAccepted) process.exit(2);
