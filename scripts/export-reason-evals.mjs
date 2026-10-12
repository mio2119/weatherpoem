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
  "reason-evals.json",
);
const checkOnly = process.argv.includes("--check");

const festivals = [
  ["chunjie", "春节"],
  ["yuanxiao", "元宵节"],
  ["qingming", "清明节"],
  ["duanwu", "端午节"],
  ["qixi", "七夕节"],
  ["zhongqiu", "中秋节"],
  ["chongyang", "重阳节"],
  ["chuxi", "除夕"],
];
const solarTerms = [
  ["lichun", "立春", "spring"],
  ["yushui", "雨水", "spring"],
  ["jingzhe", "惊蛰", "spring"],
  ["chunfen", "春分", "spring"],
  ["qingming", "清明", "spring"],
  ["guyu", "谷雨", "spring"],
  ["lixia", "立夏", "summer"],
  ["xiaoman", "小满", "summer"],
  ["mangzhong", "芒种", "summer"],
  ["xiazhi", "夏至", "summer"],
  ["xiaoshu", "小暑", "summer"],
  ["dashu", "大暑", "summer"],
  ["liqiu", "立秋", "autumn"],
  ["chushu", "处暑", "autumn"],
  ["bailu", "白露", "autumn"],
  ["qiufen", "秋分", "autumn"],
  ["hanlu", "寒露", "autumn"],
  ["shuangjiang", "霜降", "autumn"],
  ["lidong", "立冬", "winter"],
  ["xiaoxue", "小雪", "winter"],
  ["daxue", "大雪", "winter"],
  ["dongzhi", "冬至", "winter"],
  ["xiaohan", "小寒", "winter"],
  ["dahan", "大寒", "winter"],
];
const weatherKinds = [
  ["clear", "晴"],
  ["cloudy", "多云"],
  ["overcast", "阴"],
  ["light-rain", "小雨"],
  ["rain", "雨"],
  ["heavy-rain", "大雨"],
  ["snow", "雪"],
  ["fog", "雾"],
  ["wind", "风"],
  ["hot", "炎热"],
  ["cold", "严寒"],
];
const timePeriods = [
  ["morning", "清晨"],
  ["day", "白天"],
  ["evening", "傍晚"],
  ["night", "夜晚"],
];
const weatherLabels = new Map(weatherKinds);
const allowedWeather = new Set(weatherKinds.map(([kind]) => kind));

function ranked(poems) {
  return [...poems].sort(
    (left, right) =>
      right.quality - left.quality ||
      left.id.localeCompare(right.id, "en"),
  );
}

function selectPoem(poems, predicate, label) {
  const selected = ranked(poems.filter(predicate))[0];
  if (!selected) throw new Error(`无法为评测场景选择作品：${label}`);
  return selected;
}

function poemWeather(poem, preferred) {
  if (preferred && poem.tags.weather.includes(preferred)) {
    return preferred;
  }
  return (
    poem.tags.weather.find((kind) => allowedWeather.has(kind)) ??
    "clear"
  );
}

function poemPeriod(poem, preferred) {
  if (preferred && poem.tags.timePeriods.includes(preferred)) {
    return preferred;
  }
  return poem.tags.timePeriods[0] ?? "day";
}

function poemSeason(poem, preferred) {
  if (preferred && poem.tags.seasons.includes(preferred)) {
    return preferred;
  }
  return poem.tags.seasons[0] ?? preferred ?? "spring";
}

function assertFallback(value, caseId) {
  const length = Array.from(value).length;
  if (length < 6 || length > 40 || /\r|\n|https?:\/\//i.test(value)) {
    throw new Error(`${caseId} 的规则回退理由不符合 6—40 字契约`);
  }
  return value;
}

const vite = await createServer({
  root: projectRoot,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

try {
  const [{ POEMS }, { CONTENT_VERSION, RULE_VERSION }] =
    await Promise.all([
      vite.ssrLoadModule("/src/data/poems.ts"),
      vite.ssrLoadModule("/src/core/recommendation.ts"),
    ]);

  const cases = [];

  for (const [slug, term, season] of solarTerms) {
    const poem = selectPoem(
      POEMS,
      (candidate) => candidate.tags.solarTerms.includes(term),
      term,
    );
    const weatherKind = poemWeather(poem);
    const id = `solar-${slug}`;
    cases.push({
      id,
      focus: "solar-term",
      workId: poem.id,
      context: {
        solarTerm: term,
        season: poemSeason(poem, season),
        timePeriod: poemPeriod(poem),
        weather: {
          kind: weatherKind,
          label: weatherLabels.get(weatherKind),
        },
      },
      fallbackReason: assertFallback(
        `${term}时读这首诗，正好留意季节的转身。`,
        id,
      ),
    });
  }

  for (const [slug, festival] of festivals) {
    const poem = selectPoem(
      POEMS,
      (candidate) => candidate.tags.festivals.includes(festival),
      festival,
    );
    const weatherKind = poemWeather(poem);
    const id = `festival-${slug}`;
    cases.push({
      id,
      focus: "festival",
      workId: poem.id,
      context: {
        festival,
        solarTerm: poem.tags.solarTerms[0],
        season: poemSeason(poem),
        timePeriod: poemPeriod(poem),
        weather: {
          kind: weatherKind,
          label: weatherLabels.get(weatherKind),
        },
      },
      fallbackReason: assertFallback(
        `${festival}读这首诗，正好照见节日里的情意。`,
        id,
      ),
    });
  }

  for (const [weatherKind, label] of weatherKinds) {
    const poem = selectPoem(
      POEMS,
      (candidate) => candidate.tags.weather.includes(weatherKind),
      weatherKind,
    );
    const id = `weather-${weatherKind}`;
    cases.push({
      id,
      focus: "weather",
      workId: poem.id,
      context: {
        solarTerm: poem.tags.solarTerms[0],
        season: poemSeason(poem),
        timePeriod: poemPeriod(poem),
        weather: { kind: weatherKind, label },
      },
      fallbackReason: assertFallback(
        `${label}天读这首诗，让今日天气有了文化回声。`,
        id,
      ),
    });
  }

  for (const [period, label] of timePeriods) {
    const poem = selectPoem(
      POEMS,
      (candidate) => candidate.tags.timePeriods.includes(period),
      period,
    );
    const weatherKind = poemWeather(poem);
    const id = `time-${period}`;
    cases.push({
      id,
      focus: "time-period",
      workId: poem.id,
      context: {
        solarTerm: poem.tags.solarTerms[0],
        season: poemSeason(poem),
        timePeriod: period,
        weather: {
          kind: weatherKind,
          label: weatherLabels.get(weatherKind),
        },
      },
      fallbackReason: assertFallback(
        `${label}读这首诗，让当下多一层安静的连接。`,
        id,
      ),
    });
  }

  const suite = {
    schemaVersion: "1.0",
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
    acceptance: {
      minimumAutomatedPassRate: 1,
      maximumP95LatencyMs: 2000,
      minimumHumanQualityPassRate: 0.9,
      minimumHumanScore: 4,
      maximumFactualErrors: 0,
      maximumSafetyIssues: 0,
    },
    cases,
  };
  const serialized = `${JSON.stringify(suite, null, 2)}\n`;

  if (checkOnly) {
    const current = await readFile(outputPath, "utf8");
    if (current !== serialized) {
      throw new Error(
        "server/reason-evals.json 与当前内容目录不一致，请运行 npm run reason:eval:catalog",
      );
    }
    console.log(
      `AI 理由评测集校验通过：${cases.length} 个场景，覆盖 8 节日、24 节气、11 类安全天气和 4 时段。`,
    );
  } else {
    await writeFile(outputPath, serialized, "utf8");
    console.log(
      `已生成 ${cases.length} 个 AI 理由评测场景到 server/reason-evals.json。`,
    );
  }
} finally {
  await vite.close();
}
