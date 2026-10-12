import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_HEADERS,
  buildReviewRows,
  buildReviewTemplateCsv,
  parseCsv,
  serializeCsv,
  validateCompletedReviewCsv,
} from "./content-review-contract.mjs";

const work = {
  id: "sample-work",
  title: "示例诗",
  author: "作者",
  dynasty: "唐",
  literaryForm: "五言绝句",
  sourceName: "《权威总集》",
  fullText: ["第一句，第二句。", "第三句，第四句。"],
  excerpt: ["第一句", "第三句"],
  annotations: [{ term: "示例", explanation: "用于测试。" }],
  culturalBackground: "这里是用于验证审核契约的文化背景说明。",
  contemporaryConnection: "这里是用于验证审核契约的当代连接说明。",
  tags: {
    festivals: [],
    weather: ["clear"],
    solarTerms: ["立春"],
    seasons: ["spring"],
    timePeriods: ["morning"],
    emotions: ["明朗"],
    lifeScenes: ["校园"],
  },
};

const catalog = {
  schemaVersion: "1.0",
  contentVersion: "2026.07.1",
  works: [work],
};

function completedRow() {
  const row = buildReviewRows(catalog)[0];
  row.splice(
    13,
    16,
    "李明",
    "示范大学中文系",
    "2026-07-23",
    "《权威总集》2024年整理本",
    "https://library.example.edu/work/sample",
    "通过",
    "通过",
    "通过",
    "通过",
    "通过",
    "通过",
    "",
    "",
    "周岚",
    "2026-07-24",
    "通过",
  );
  row[29] = "完整";
  return row;
}

test("CSV 序列化与解析保留换行、逗号和引号", () => {
  const source = [
    ["A", "B"],
    ['带"引号"', "带,逗号\n和换行"],
  ];
  assert.deepEqual(parseCsv(serializeCsv(source)), source);
});

test("空白模板锁定表头和当前内容，但不能冒充完成审核", () => {
  const csv = buildReviewTemplateCsv(catalog);
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], REVIEW_HEADERS);
  assert.equal(rows[1][1], work.id);
  const result = validateCompletedReviewCsv(csv, catalog, {
    today: "2026-07-24",
  });
  assert.equal(result.contractValid, false);
  assert.equal(result.releaseReady, false);
});

test("两人完成五项核对并提供底本证据后可以通过", () => {
  const csv = serializeCsv([REVIEW_HEADERS, completedRow()]);
  const result = validateCompletedReviewCsv(csv, catalog, {
    today: "2026-07-24",
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.passed, 1);
  assert.equal(result.releaseReady, true);
});

test("篡改只读内容、同人复核或带错误项通过都会被拒绝", () => {
  const row = completedRow();
  row[2] = "被改动的篇名";
  row[19] = "有误";
  row[26] = row[13];
  const result = validateCompletedReviewCsv(
    serializeCsv([REVIEW_HEADERS, row]),
    catalog,
    { today: "2026-07-24" },
  );
  assert.equal(result.releaseReady, false);
  assert.ok(
    result.issues.some(({ field }) => field === "篇名"),
  );
  assert.ok(
    result.issues.some(({ field }) => field === "初审结论"),
  );
  assert.ok(
    result.issues.some(({ field }) => field === "复核人"),
  );
});

test("需修订或撤回必须留下问题和修订建议", () => {
  const row = completedRow();
  row[18] = "有误";
  row[23] = "需修订";
  row[24] = "";
  row[25] = "";
  row[28] = "退回修订";
  const result = validateCompletedReviewCsv(
    serializeCsv([REVIEW_HEADERS, row]),
    catalog,
    { today: "2026-07-24" },
  );
  assert.equal(result.releaseReady, false);
  assert.ok(
    result.issues.some(({ field }) => field === "问题说明/修订建议"),
  );
});
