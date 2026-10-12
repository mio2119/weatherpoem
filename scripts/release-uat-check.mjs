import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_UAT_PLAN,
  validateReleaseUatPlan,
} from "./release-uat-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const [packageJson, traceability, release, plan] =
  await Promise.all([
    readJson("package.json"),
    readJson("review/requirements-traceability.json"),
    readJson("output/WeatherPoem_0.2.0_RELEASE.json"),
    readJson(RELEASE_UAT_PLAN),
  ]);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );
}

validateReleaseUatPlan(plan, {
  appVersion: packageJson.version,
  contentVersion: traceability.contentVersion,
  artifacts: release.artifacts,
});
console.log(
  "非开发人员 UAT 计划有效：已绑定三项当前发布物和 11 个场景；两名真实测试者、缺陷结论与具名批准仍待执行。",
);
