import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectReleaseState,
  createReleaseManifest,
  parseAllowedThumbprints,
  serializeReleaseManifest,
} from "./release-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const checkOnly = process.argv.includes("--check");
const state = await collectReleaseState(projectRoot);
const allowedThumbprints = parseAllowedThumbprints(
  process.env.WEATHERPOEM_ALLOWED_SIGNER_THUMBPRINTS,
);
const manifest = createReleaseManifest(state, {
  baseUrl: process.env.WEATHERPOEM_RELEASE_BASE_URL,
  allowedThumbprints,
});
const outputPath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${state.version}_RELEASE.json`,
);
const serialized = serializeReleaseManifest(manifest);

if (checkOnly) {
  const current = await readFile(outputPath, "utf8");
  if (current !== serialized) {
    throw new Error(
      "发布清单已过期，请在构建和签名完成后运行 npm run release:manifest",
    );
  }
  console.log(
    `发布清单一致：${state.channel} / ${manifest.trustLevel} / ${manifest.artifacts.length} 个发布物。`,
  );
} else {
  await writeFile(outputPath, serialized, "utf8");
  console.log(`已生成发布清单：${outputPath}`);
}
