import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncCanonicalLicenseTexts } from "./canonical-license-text-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const policyPath = path.join(
  projectRoot,
  "review",
  "canonical-license-text-policy.json",
);
const manifestPath = path.join(
  projectRoot,
  "review",
  "canonical-license-text-supplements.json",
);
const policy = JSON.parse(await readFile(policyPath, "utf8"));

async function fetchBytes(url, licenseId) {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github.raw+json",
      "user-agent": "WeatherPoem-license-evidence/0.2.0",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(
      `SPDX ${licenseId} 下载失败：${response.status}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

const manifest = await syncCanonicalLicenseTexts({
  projectRoot,
  policy,
  fetchBytes,
});
await writeFile(
  manifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      source:
        `${manifest.source.releaseTag}@` +
        manifest.source.gitCommit,
      licenseTextCount: manifest.files.length,
      reviewedExceptionCount: manifest.bindings.length,
      manifest:
        "review/canonical-license-text-supplements.json",
    },
    null,
    2,
  ),
);
