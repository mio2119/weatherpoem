import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const read = (relativePath) =>
  readFile(path.join(projectRoot, relativePath), "utf8");
const [
  productDesign,
  mvpVerification,
  eventSpec,
  performanceVerification,
  projectReadiness,
  contentAssetLicenses,
] =
  await Promise.all([
    read("docs/WeatherPoem_产品设计工作稿.md"),
    read("docs/MVP_VERIFICATION.md"),
    read(
      "docs/superpowers/specs/" +
        "2026-07-24-curated-important-events-design.md",
    ),
    read("docs/PERFORMANCE_VERIFICATION.md"),
    read("docs/PROJECT_READINESS.md"),
    read("docs/CONTENT_ASSET_LICENSES.md"),
  ]);

test("important events remain a reviewed post-pilot feature", () => {
  assert.match(
    productDesign,
    /PD-09[^]*MVP 与四周校园试点不接入实时新闻/,
  );
  assert.match(
    productDesign,
    /### 5\.3 后续重要事件能力边界/,
  );
  assert.match(
    productDesign,
    /人工批准的重要事件专题 ＞ 节日 ＞ 天气 ＞ 节气/,
  );
  assert.match(
    productDesign,
    /严重天气或公共安全抑制状态下，普通诗笺和重要事件专题都暂停/,
  );
  assert.match(
    productDesign,
    /AI 不读取原始新闻/,
  );
  assert.match(
    productDesign,
    /1\.2 Curated Context/,
  );
});

test("future event scope cannot masquerade as current MVP evidence", () => {
  const mvpSection = productDesign.match(
    /### 5\.1 MVP 范围内([^]*?)### 5\.2 MVP 范围外/,
  )?.[1] ?? "";
  assert.doesNotMatch(
    mvpSection,
    /实时新闻|重要事件专题|自动热点/,
  );
  assert.match(
    mvpVerification,
    /重要事件专题不属于当前 MVP/,
  );
  assert.match(
    mvpVerification,
    /不得把未来规格当作当前实现或当前验收证据/,
  );
});

test("approved event design preserves low-density progressive disclosure", () => {
  for (const source of [productDesign, eventSpec]) {
    assert.match(source, /主卡片仍只展示一首诗/);
    assert.match(source, /AI 不读取原始新闻/);
    assert.match(source, /具名编辑/);
    assert.match(source, /具名审核/);
  }
  assert.match(eventSpec, /事件背景默认折叠/);
  assert.match(
    eventSpec,
    /本设计不授权实时新闻抓取/,
  );
  assert.match(
    eventSpec,
    /不允许 AI 自动生成并发布事件专题/,
  );
});

test("formal requirements source reflects current long-run and installer NOTICE evidence", () => {
  assert.match(
    productDesign,
    /正式八小时长测[^]*480\/480[^]*正式门禁通过/,
  );
  assert.match(
    productDesign,
    /NSIS[^]*NOTICE[^]*逐字节[^]*通过/,
  );
  assert.match(
    productDesign,
    /管理员 MSI[^]*仍待完成/,
  );
  assert.doesNotMatch(
    productDesign,
    /真实聚合证据仍须等待八小时长测结束|当前长测候选尚未重建，聚合证据尚未生成/,
  );
});

test("supporting readiness documents do not regress to the archived candidate state", () => {
  for (const source of [
    performanceVerification,
    projectReadiness,
    mvpVerification,
  ]) {
    assert.match(
      source,
      /正式八小时[^]*480\/480[^]*正式门禁\s*通过/,
    );
  }
  assert.match(
    performanceVerification,
    /D388D9484A7B81B1039CFAA1D21CBAD178750E5375B8FBCA7D8334A8C681609A/,
  );
  assert.doesNotMatch(
    performanceVerification,
    /830FBE885FCCECD24C43A9209085F053CA78687558DE7A3B466A00024AC310A5/,
  );
  for (const source of [
    contentAssetLicenses,
    projectReadiness,
    mvpVerification,
  ]) {
    assert.match(source, /NSIS[^]*NOTICE[^]*逐字节[^]*通过/);
    assert.match(source, /管理员 MSI[^]*仍待完成/);
    assert.doesNotMatch(
      source,
      /正在运行的八小时候选尚未重建|当前八小时候选尚未重建|长测后重建并验证 NOTICE/,
    );
  }
});
