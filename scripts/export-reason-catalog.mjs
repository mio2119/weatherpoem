import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputPath = path.join(
  projectRoot,
  "server",
  "reason-catalog.json",
);
const checkOnly = process.argv.includes("--check");

const vite = await createServer({
  root: projectRoot,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const [{ POEMS }, { CONTENT_VERSION, RULE_VERSION }] = await Promise.all([
    vite.ssrLoadModule("/src/data/poems.ts"),
    vite.ssrLoadModule("/src/core/recommendation.ts"),
  ]);
  const catalog = {
    schemaVersion: "1.0",
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
    works: POEMS.map((poem) => ({
      id: poem.id,
      title: poem.title,
      author: poem.author,
      dynasty: poem.dynasty,
      summary: poem.oneLineSummary,
    })),
  };
  const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
  if (checkOnly) {
    const current = await readFile(outputPath, "utf8");
    if (current !== serialized) {
      throw new Error(
        "server/reason-catalog.json 与已发布内容目录不一致，请运行 npm run reason:catalog",
      );
    }
    console.log(
      `AI 理由服务目录校验通过：${catalog.works.length} 首，内容版本 ${CONTENT_VERSION}。`,
    );
  } else {
    await writeFile(outputPath, serialized, "utf8");
    console.log(
      `已导出 ${catalog.works.length} 首作品到 server/reason-catalog.json。`,
    );
  }
} finally {
  await vite.close();
}
