import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "review", "redesign", "evidence");
const manifestPath = "output/WeatherPoem_0.2.0_RELEASE.json";
const checksumsPath = "output/WeatherPoem_0.2.0_SHA256.txt";
const protectedFiles = [
  { path: manifestPath, sha256: "5D4FAF610A9EB29F9833055A12B943F870410D5C62F9D17D8BEB3C25F29F619B" },
  { path: checksumsPath, sha256: "F745407E9DBEE18A087B220E2B468D8EB6FB68CBF7BF2096E7247EBB032E9A4B" },
];
const artifacts = [
  {
    kind: "portable",
    path: "src-tauri/target/release/weatherpoem.exe",
    name: "weatherpoem.exe",
    sha256: "00DB4B15F96E151CD7AF795A197E422F39ABFC3CE13E4AB298BF1DE7EC2DD74B",
  },
  {
    kind: "nsis",
    path: "src-tauri/target/release/bundle/nsis/WeatherPoem_0.2.0_x64-setup.exe",
    name: "WeatherPoem_0.2.0_x64-setup.exe",
    sha256: "FD46A8E141C01D3B1BBB72FE685C48D8E099465C5A744B8CC930BBF947A29EA5",
  },
  {
    kind: "msi",
    path: "src-tauri/target/release/bundle/msi/WeatherPoem_0.2.0_x64_en-US.msi",
    name: "WeatherPoem_0.2.0_x64_en-US.msi",
    sha256: "4A26D274384A9D39EBC75C967C2448C22DE66AAF4E3BAD640B0D5584C9C2352D",
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function reportPath(argument) {
  const match = /^--(?:report|check)=(T00_OLD_RELEASE_BYTE_AUDIT_[A-Z0-9_]+\.json)$/.exec(argument ?? "");
  assert.ok(match, "Specify --report= or --check= with a T00_OLD_RELEASE_BYTE_AUDIT_*.json name");
  return path.join(evidenceRoot, match[1]);
}

async function audit() {
  const protectedEvidence = [];
  for (const item of protectedFiles) {
    const actual = sha256(await readFile(path.join(root, item.path)));
    assert.equal(actual, item.sha256, `Old protected evidence changed: ${item.path}`);
    protectedEvidence.push({ path: item.path, sha256: actual, matchesFrozenBaseline: true });
  }

  const manifest = JSON.parse(await readFile(path.join(root, manifestPath), "utf8"));
  const checksumLines = (await readFile(path.join(root, checksumsPath), "utf8")).split(/\r?\n/);
  assert.equal(manifest.version, "0.2.0");
  assert.equal(manifest.channel, "trial");
  const verifiedArtifacts = [];
  for (const item of artifacts) {
    const fullPath = path.join(root, item.path);
    const bytes = await readFile(fullPath);
    const actual = sha256(bytes);
    const sizeBytes = (await stat(fullPath)).size;
    const declared = manifest.artifacts.find((entry) => entry.kind === item.kind && entry.name === item.name);
    assert.ok(declared, `Old manifest omits ${item.name}`);
    assert.equal(actual, item.sha256, `Old artifact changed: ${item.path}`);
    assert.equal(declared.sha256, actual, `Manifest SHA-256 differs: ${item.name}`);
    assert.equal(declared.size, sizeBytes, `Manifest size differs: ${item.name}`);
    assert.ok(checksumLines.includes(`${actual}  ${item.name}`), `SHA list differs: ${item.name}`);
    verifiedArtifacts.push({
      kind: item.kind,
      path: item.path,
      sizeBytes,
      sha256: actual,
      matchesFrozenBaseline: true,
      matchesManifest: true,
      matchesChecksumList: true,
    });
  }
  return { protectedEvidence, artifacts: verifiedArtifacts };
}

const argument = process.argv[2];
assert.equal(process.argv.length, 3, "Specify exactly one report or check argument");
const destination = reportPath(argument);
const current = await audit();
if (argument.startsWith("--check=")) {
  const saved = JSON.parse(await readFile(destination, "utf8"));
  assert.equal(saved.testKind, "read-only-old-release-byte-audit");
  assert.equal(saved.result, "old-artifacts-byte-identical");
  assert.deepEqual(saved.protectedEvidence, current.protectedEvidence);
  assert.deepEqual(saved.artifacts, current.artifacts);
  process.stdout.write(`旧版发布物字节核验报告有效：${destination}\n`);
} else {
  const report = {
    schemaVersion: "1.0",
    testKind: "read-only-old-release-byte-audit",
    generatedAt: new Date().toISOString(),
    baselineVersion: "0.2.0",
    protectedEvidence: current.protectedEvidence,
    artifacts: current.artifacts,
    limitations: [
      "This checks exact old release files and frozen metadata, not the current redesign candidate.",
      "It does not launch or install the old product or visually inspect its safety and withdrawal states.",
    ],
    result: "old-artifacts-byte-identical",
  };
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`旧版发布物字节核验通过：${destination}\n`);
}
