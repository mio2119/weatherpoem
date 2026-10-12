import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SIGNED_UPDATER_PLAN,
  buildSignedUpdaterPlan,
  sha256File,
  validateSignedUpdaterPlan,
} from "./signed-updater-plan-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readJson = async (relativePath) =>
  JSON.parse(
    await readFile(path.join(projectRoot, relativePath), "utf8"),
  );
const [packageJson, releaseManifest, tauriConfig, cargoToml, libRs] =
  await Promise.all([
    readJson("package.json"),
    readJson("output/WeatherPoem_0.2.0_RELEASE.json"),
    readJson("src-tauri/tauri.conf.json"),
    readFile(
      path.join(projectRoot, "src-tauri", "Cargo.toml"),
      "utf8",
    ),
    readFile(
      path.join(projectRoot, "src-tauri", "src", "lib.rs"),
      "utf8",
    ),
  ]);
const portable = releaseManifest.artifacts.find(
  (item) => item.kind === "portable",
);
const updaterConfig = tauriConfig.plugins?.updater;
const inputs = {
  appVersion: packageJson.version,
  releaseChannel: releaseManifest.channel,
  releaseTrustLevel: releaseManifest.trustLevel,
  portableSha256: portable.sha256,
  updaterCargoDependencyPresent:
    /tauri-plugin-updater/.test(cargoToml),
  updaterPluginInitialized:
    /tauri_plugin_updater/.test(libRs),
  updaterConfigPresent: updaterConfig !== undefined,
  updaterArtifactsEnabled:
    tauriConfig.bundle?.createUpdaterArtifacts === true,
  endpointConfigured:
    Array.isArray(updaterConfig?.endpoints) &&
    updaterConfig.endpoints.length > 0,
  publicKeyConfigured:
    typeof updaterConfig?.pubkey === "string" &&
    updaterConfig.pubkey.trim().length > 0,
  hashes: {},
};
for (const [key, relativePath] of Object.entries({
  packageJson: "package.json",
  releaseManifest: "output/WeatherPoem_0.2.0_RELEASE.json",
  tauriConfig: "src-tauri/tauri.conf.json",
  cargoToml: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
  libRs: "src-tauri/src/lib.rs",
})) {
  inputs.hashes[key] = {
    path: relativePath,
    sha256: await sha256File(
      path.join(projectRoot, ...relativePath.split("/")),
    ),
  };
}
const plan = buildSignedUpdaterPlan(
  inputs,
  new Date().toISOString(),
);
const summary = validateSignedUpdaterPlan(plan, inputs);
await writeFile(
  path.join(projectRoot, ...SIGNED_UPDATER_PLAN.split("/")),
  `${JSON.stringify(plan, null, 2)}\n`,
  "utf8",
);
console.log(
  `签名更新实施计划已生成：${summary.scenarioCount} 个正反场景、` +
    `${summary.decisionCount} 项组织决策；updater、密钥与端点仍未启用。`,
);
