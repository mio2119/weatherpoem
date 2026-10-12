import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const version = packageJson.version;
const artifacts = [
  {
    name: "weatherpoem.exe",
    relativePath: "src-tauri/target/release/weatherpoem.exe",
  },
  {
    name: `WeatherPoem_${version}_x64-setup.exe`,
    relativePath:
      `src-tauri/target/release/bundle/nsis/` +
      `WeatherPoem_${version}_x64-setup.exe`,
  },
  {
    name: `WeatherPoem_${version}_x64_en-US.msi`,
    relativePath:
      `src-tauri/target/release/bundle/msi/` +
      `WeatherPoem_${version}_x64_en-US.msi`,
  },
];

function shanghaiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256")
    .update(bytes)
    .digest("hex")
    .toUpperCase();
}

const lines = [];
for (const artifact of artifacts) {
  const filePath = path.join(projectRoot, artifact.relativePath);
  const metadata = await stat(filePath);
  if (!metadata.isFile() || metadata.size < 1_000_000) {
    throw new Error(`发布物缺失或尺寸异常：${artifact.relativePath}`);
  }
  lines.push(`${await sha256(filePath)}  ${artifact.name}`);
}

const outputPath = path.join(
  projectRoot,
  "output",
  `WeatherPoem_${version}_SHA256.txt`,
);
const content = [
  `WeatherPoem ${version} (x64) SHA-256`,
  `Generated: ${shanghaiDate()} Asia/Shanghai`,
  "",
  ...lines,
  "",
].join("\n");

await writeFile(outputPath, content, "utf8");
console.log(`已生成 SHA-256 清单：${outputPath}`);
