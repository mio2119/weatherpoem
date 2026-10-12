import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CODE_SIGNING_PLAN,
  buildCodeSigningPlan,
  sha256File,
  validateCodeSigningPlan,
} from "./code-signing-plan-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readJson = async (relativePath) =>
  JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );
const [packageJson, releaseManifest, tauriConfig] =
  await Promise.all([
    readJson("package.json"),
    readJson("output/WeatherPoem_0.2.0_RELEASE.json"),
    readJson("src-tauri/tauri.conf.json"),
  ]);
const windowsConfig = tauriConfig.bundle?.windows ?? {};
const inputs = {
  appVersion: packageJson.version,
  releaseChannel: releaseManifest.channel,
  releaseTrustLevel: releaseManifest.trustLevel,
  artifacts: releaseManifest.artifacts.map((item) => ({
    kind: item.kind,
    name: item.name,
    size: item.size,
    sha256: item.sha256,
    signatureStatus: item.signature.status,
  })),
  allNotSigned: releaseManifest.artifacts.every(
    (item) => item.signature.status === "NotSigned",
  ),
  signingConfigPresent: Boolean(
    windowsConfig.certificateThumbprint ||
      windowsConfig.timestampUrl ||
      windowsConfig.signCommand,
  ),
  productionDownloadUrlsPresent:
    releaseManifest.artifacts.every(
      (item) =>
        typeof item.downloadUrl === "string" &&
        item.downloadUrl.startsWith("https://"),
    ),
  hashes: {},
};
for (const [key, relativePath] of Object.entries({
  packageJson: "package.json",
  releaseManifest: "output/WeatherPoem_0.2.0_RELEASE.json",
  checksums: "output/WeatherPoem_0.2.0_SHA256.txt",
  tauriConfig: "src-tauri/tauri.conf.json",
  releaseSupport: "scripts/release-support.mjs",
  releaseTrust: "docs/WINDOWS_RELEASE_TRUST.md",
})) {
  inputs.hashes[key] = {
    path: relativePath,
    sha256: await sha256File(
      path.join(projectRoot, ...relativePath.split("/")),
    ),
  };
}
const plan = buildCodeSigningPlan(
  inputs,
  new Date().toISOString(),
);
const summary = validateCodeSigningPlan(plan, inputs);
await writeFile(
  path.join(projectRoot, ...CODE_SIGNING_PLAN.split("/")),
  `${JSON.stringify(plan, null, 2)}\n`,
  "utf8",
);
console.log(
  `Windows 代码签名计划已生成：${summary.artifactCount} 项发布物、` +
    `${summary.scenarioCount} 个场景、${summary.procurementItemCount} 项组织准备；` +
    "证书、签名服务和具名批准仍未取得。",
);
