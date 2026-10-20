import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REVIEW_SCHEMA_VERSION,
  buildReviewTemplateCsv,
} from "./content-review-contract.mjs";
import { loadBundledModule } from "./load-reason-sources.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const catalogPath = path.join(
  projectRoot,
  "review",
  "content-review-catalog.json",
);
const checkOnly = process.argv.includes("--check");

const { POEMS } = await loadBundledModule(projectRoot, "src/data/poems.ts");
const { CONTENT_REVIEWS } = await loadBundledModule(
  projectRoot,
  "src/data/content-reviews.ts",
);
const { CONTENT_VERSION } = await loadBundledModule(
  projectRoot,
  "src/core/recommendation.ts",
);

if (POEMS.length !== 120) {
  throw new Error(
    `专家审核包必须覆盖当前 120 首发布作品，实际为 ${POEMS.length} 首`,
  );
}

const catalog = {
  schemaVersion: REVIEW_SCHEMA_VERSION,
  contentVersion: CONTENT_VERSION,
  workCount: POEMS.length,
  works: POEMS.map((poem) => ({
    id: poem.id,
    title: poem.title,
    literaryForm: poem.literaryForm,
    author: poem.author,
    dynasty: poem.dynasty,
    fullText: poem.fullText,
    excerpt: poem.excerpt,
    sourceName: poem.sourceName,
    oneLineSummary: poem.oneLineSummary,
    culturalBackground: poem.culturalBackground,
    contemporaryConnection: poem.contemporaryConnection,
    annotations: poem.annotations,
    tags: poem.tags,
    quality: poem.quality,
    engineeringReview: CONTENT_REVIEWS[poem.id],
  })),
};
const catalogText = `${JSON.stringify(catalog, null, 2)}\n`;
const csvText = buildReviewTemplateCsv(catalog);
const csvFilename =
  `WeatherPoem_内容专家审核回收模板_${CONTENT_VERSION}.csv`;
const csvPath = path.join(projectRoot, "output", csvFilename);

if (checkOnly) {
  const [currentCatalog, currentCsv] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(csvPath, "utf8"),
  ]);
  if (currentCatalog !== catalogText || currentCsv !== csvText) {
    throw new Error(
      "内容专家审核目录或 CSV 模板已过期，请运行 npm run content:review:export",
    );
  }
  console.log(
    `内容专家审核包一致性通过：${POEMS.length} 首，内容版本 ${CONTENT_VERSION}。`,
  );
} else {
  await Promise.all([
    mkdir(path.dirname(catalogPath), { recursive: true }),
    mkdir(path.dirname(csvPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(catalogPath, catalogText, "utf8"),
    writeFile(csvPath, csvText, "utf8"),
  ]);
  console.log(
    `已导出 ${POEMS.length} 首作品的专家审核目录与回收模板：${csvFilename}`,
  );
}
