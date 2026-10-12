import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSevenDayStatus } from "./performance-seven-day-status-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const projectPrefix = `${projectRoot}${path.sep}`;

function resolveProjectPath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Seven-day evidence contains an invalid relative path.");
  }
  const absolutePath = path.resolve(
    projectRoot,
    ...relativePath.split("/"),
  );
  if (!absolutePath.startsWith(projectPrefix)) {
    throw new Error("Seven-day evidence path escaped the project root.");
  }
  return absolutePath;
}

async function readJson(relativePath, optional = false) {
  try {
    return JSON.parse(
      await readFile(resolveProjectPath(relativePath), "utf8"),
    );
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    throw error;
  }
}

async function sha256(relativePath) {
  return createHash("sha256")
    .update(await readFile(resolveProjectPath(relativePath)))
    .digest("hex")
    .toUpperCase();
}

function processAlive(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

const packageJson = await readJson("package.json");
const launchRelativePath =
  `output/WeatherPoem_${packageJson.version}_PERFORMANCE_7D_LAUNCH.json`;
const launch = await readJson(launchRelativePath);
const checkpoint = await readJson(launch.checkpoint, true);
const report = await readJson(launch.report, true);
const artifactPath = "src-tauri/target/release/weatherpoem.exe";
const artifactStat = await stat(resolveProjectPath(artifactPath));
const artifactSha256 = await sha256(artifactPath);
const currentProtectedEvidence = await Promise.all(
  launch.protectedEvidence.map(async (item) => ({
    path: item.path,
    sha256: await sha256(item.path),
  })),
);

const status = buildSevenDayStatus({
  launch,
  checkpoint,
  report,
  expected: {
    appVersion: packageJson.version,
    exeSha256: artifactSha256,
  },
  currentArtifact: {
    sha256: artifactSha256,
    sizeBytes: artifactStat.size,
  },
  currentReleaseManifestSha256: await sha256(
    launch.releaseManifest.path,
  ),
  currentProtectedEvidence,
  processAlive,
});

console.log(JSON.stringify(status, null, 2));
