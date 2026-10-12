import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertProjectReadinessMatches,
  buildProjectReadiness,
  serializeProjectReadiness,
} from "./project-readiness-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );
}

async function exists(relativePath) {
  try {
    return (
      await stat(path.join(projectRoot, relativePath))
    ).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

const plan = await readJson(
  "review/requirements-traceability.json",
);
const packageJson = await readJson("package.json");
const contentCatalog = await readJson(
  "review/content-review-catalog.json",
);
const deviceMatrix = await readJson("review/device-matrix-plan.json");
const releaseManifest = await readJson(
  `output/WeatherPoem_${packageJson.version}_RELEASE.json`,
);
const context = {
  packageVersion: packageJson.version,
  contentCatalog,
  deviceMatrix,
  releaseManifest,
  signoffs: new Map(),
};
const referencedPaths = new Set();
for (const gate of plan.gates) {
  for (const evidencePath of gate.evidence) {
    referencedPaths.add(evidencePath);
  }
  for (const reference of gate.requirementRefs) {
    referencedPaths.add(reference.split("#", 1)[0]);
  }
}
const availablePaths = new Set();
await Promise.all(
  [...referencedPaths].map(async (relativePath) => {
    if (await exists(relativePath)) availablePaths.add(relativePath);
  }),
);
await Promise.all(
  [...availablePaths]
    .filter(
      (relativePath) =>
        relativePath.startsWith("review/evidence/") &&
        relativePath.endsWith(".json"),
    )
    .map(async (relativePath) => {
      context.signoffs.set(
        relativePath,
        await readJson(relativePath),
      );
    }),
);
const report = buildProjectReadiness(
  plan,
  context,
  availablePaths,
);
const outputPath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${packageJson.version}_READINESS.json`,
);
const checkOnly = process.argv.includes("--check");
if (checkOnly) {
  const actual = JSON.parse(await readFile(outputPath, "utf8"));
  assertProjectReadinessMatches(actual, report);
  console.log(
    `项目就绪报告一致：${report.overallStatus}；` +
      `内部试用 ${report.milestones[0].status}；` +
      `校园试点 ${report.milestones[1].status}；` +
      `公开发布 ${report.milestones[2].status}。`,
  );
} else {
  await writeFile(
    outputPath,
    serializeProjectReadiness(report),
    "utf8",
  );
  console.log(`已生成项目就绪报告：${outputPath}`);
}

const requireIndex = process.argv.indexOf("--require");
if (requireIndex >= 0) {
  const requiredId = process.argv[requireIndex + 1];
  const milestone = report.milestones.find(
    (item) => item.id === requiredId,
  );
  if (!milestone) {
    throw new Error(`未知里程碑：${requiredId ?? "<missing>"}`);
  }
  if (milestone.status !== "ready") {
    const summary = milestone.blockingGates
      .map(
        (gate) =>
          `${gate.id} ${gate.status}：${gate.nextAction}`,
      )
      .join("\n");
    throw new Error(
      `${milestone.name} 尚未就绪，存在 ${milestone.blockingGates.length} 个阻断项：\n${summary}`,
    );
  }
}
