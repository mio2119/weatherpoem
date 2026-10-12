import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildReasonPrompt,
  indexCatalog,
  validateReasonRequest,
  validateReasonText,
} from "./reason-contract.mjs";

const rawCatalog = JSON.parse(
  await readFile(new URL("./reason-catalog.json", import.meta.url), "utf8"),
);
const catalog = indexCatalog(rawCatalog);
const work = catalog.works.values().next().value;
const now = Date.parse("2026-07-24T12:00:00+08:00");

function validRequest() {
  return {
    schemaVersion: "1.1",
    contentVersion: catalog.contentVersion,
    ruleVersion: catalog.ruleVersion,
    work: { ...work },
    context: {
      localDate: "2026-07-24",
      solarTerm: "大暑",
      season: "summer",
      timePeriod: "day",
      weather: {
        kind: "overcast",
        label: "阴",
      },
    },
    fallbackReason: "阴云让今天的诗意显得更加安静清晰。",
    constraints: {
      language: "zh-CN",
      maxCharacters: 40,
      noNewlines: true,
      noDisasterRomanticization: true,
    },
  };
}

test("服务端只接受与发布目录完全一致的作品事实", () => {
  const accepted = validateReasonRequest(validRequest(), catalog, now);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.work, work);

  const forged = validRequest();
  forged.work.author = "伪造作者";
  assert.deepEqual(
    validateReasonRequest(forged, catalog, now),
    { ok: false, code: "work_mismatch" },
  );
});

test("版本、天气、日历和未知字段均需通过白名单", () => {
  const wrongVersion = validRequest();
  wrongVersion.contentVersion = "old";
  assert.equal(
    validateReasonRequest(wrongVersion, catalog, now).code,
    "version_mismatch",
  );

  const storm = validRequest();
  storm.context.weather = { kind: "thunderstorm", label: "雷暴" };
  assert.equal(
    validateReasonRequest(storm, catalog, now).code,
    "invalid_weather",
  );

  const extra = validRequest();
  extra.context.latitude = 39.9;
  assert.equal(
    validateReasonRequest(extra, catalog, now).code,
    "invalid_context",
  );
});

test("模型理由仍需作品一致、长度合格且不含危险格式", () => {
  assert.deepEqual(
    validateReasonText(
      {
        workId: work.id,
        reason: "阴云与夏意相接，让诗中的景物更贴近此刻。",
      },
      work.id,
    ),
    {
      workId: work.id,
      reason: "阴云与夏意相接，让诗中的景物更贴近此刻。",
    },
  );
  assert.equal(
    validateReasonText(
      { workId: work.id, reason: "作为一个AI，我推荐这首诗。" },
      work.id,
    ),
    undefined,
  );
  assert.equal(
    validateReasonText(
      { workId: "other", reason: "这段理由的长度本来是合格的。" },
      work.id,
    ),
    undefined,
  );
});

test("提示词只包含目录事实与标准化语境，不发送规则回退理由", () => {
  const accepted = validateReasonRequest(validRequest(), catalog, now);
  assert.equal(accepted.ok, true);
  const prompt = buildReasonPrompt(accepted.value);
  assert.match(prompt, new RegExp(work.title));
  assert.match(prompt, /天气：阴/);
  assert.doesNotMatch(prompt, /fallbackReason|安静清晰/);
  assert.match(prompt, /不得改选、替换或新增作品/);
});
