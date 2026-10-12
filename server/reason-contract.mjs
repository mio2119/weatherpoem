const FESTIVALS = new Set([
  "春节",
  "元宵节",
  "清明节",
  "端午节",
  "七夕节",
  "中秋节",
  "重阳节",
  "除夕",
]);

const SOLAR_TERMS = new Set([
  "立春",
  "雨水",
  "惊蛰",
  "春分",
  "清明",
  "谷雨",
  "立夏",
  "小满",
  "芒种",
  "夏至",
  "小暑",
  "大暑",
  "立秋",
  "处暑",
  "白露",
  "秋分",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
  "冬至",
  "小寒",
  "大寒",
]);

const SEASONS = new Set(["spring", "summer", "autumn", "winter"]);
const TIME_PERIODS = new Set(["morning", "day", "evening", "night"]);
const WEATHER_LABELS = new Map([
  ["clear", new Set(["晴"])],
  ["cloudy", new Set(["多云"])],
  ["overcast", new Set(["阴"])],
  ["light-rain", new Set(["小雨"])],
  ["rain", new Set(["雨"])],
  ["heavy-rain", new Set(["大雨"])],
  ["snow", new Set(["雪"])],
  ["fog", new Set(["雾"])],
  ["wind", new Set(["风"])],
  ["hot", new Set(["炎热"])],
  ["cold", new Set(["严寒"])],
]);

const UNSAFE_REASON_PATTERNS = [
  /https?:\/\//i,
  /\r|\n/,
  /作为一个AI|作为人工智能|语言模型/i,
];

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(value, allowed, required = allowed) {
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => allowed.includes(key))
  );
}

function boundedText(value, minimum, maximum) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  if (length < minimum || length > maximum) return undefined;
  return normalized;
}

function dateDistanceIsAllowed(localDate, now) {
  if (
    typeof localDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(localDate)
  ) {
    return false;
  }
  const milliseconds = Date.parse(`${localDate}T12:00:00+08:00`);
  return (
    Number.isFinite(milliseconds) &&
    Math.abs(milliseconds - now) <= 3 * 24 * 60 * 60 * 1000
  );
}

export function validateReasonText(value, expectedWorkId) {
  if (!isPlainObject(value)) return undefined;
  if (!hasOnlyKeys(value, ["workId", "reason"])) return undefined;
  if (value.workId !== expectedWorkId) return undefined;
  const reason = boundedText(value.reason, 6, 40);
  if (!reason) return undefined;
  if (UNSAFE_REASON_PATTERNS.some((pattern) => pattern.test(reason))) {
    return undefined;
  }
  return { workId: expectedWorkId, reason };
}

export function indexCatalog(catalog) {
  if (
    !isPlainObject(catalog) ||
    catalog.schemaVersion !== "1.0" ||
    typeof catalog.contentVersion !== "string" ||
    typeof catalog.ruleVersion !== "string" ||
    !Array.isArray(catalog.works)
  ) {
    throw new Error("AI 理由目录格式无效");
  }
  const result = new Map();
  for (const work of catalog.works) {
    if (
      !isPlainObject(work) ||
      !hasOnlyKeys(work, [
        "id",
        "title",
        "author",
        "dynasty",
        "summary",
      ]) ||
      typeof work.id !== "string" ||
      result.has(work.id)
    ) {
      throw new Error("AI 理由目录存在无效或重复作品");
    }
    result.set(work.id, Object.freeze({ ...work }));
  }
  if (result.size < 120) {
    throw new Error("AI 理由目录少于 120 首");
  }
  return Object.freeze({
    contentVersion: catalog.contentVersion,
    ruleVersion: catalog.ruleVersion,
    works: result,
  });
}

export function validateReasonRequest(value, catalog, now = Date.now()) {
  const fail = (code) => ({ ok: false, code });
  if (
    !isPlainObject(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "contentVersion",
      "ruleVersion",
      "work",
      "context",
      "fallbackReason",
      "constraints",
    ])
  ) {
    return fail("invalid_root");
  }
  if (
    value.schemaVersion !== "1.1" ||
    value.contentVersion !== catalog.contentVersion ||
    value.ruleVersion !== catalog.ruleVersion
  ) {
    return fail("version_mismatch");
  }

  const work = value.work;
  if (
    !isPlainObject(work) ||
    !hasOnlyKeys(work, [
      "id",
      "title",
      "author",
      "dynasty",
      "summary",
    ])
  ) {
    return fail("invalid_work");
  }
  const publishedWork = catalog.works.get(work.id);
  if (
    !publishedWork ||
    ["id", "title", "author", "dynasty", "summary"].some(
      (key) => work[key] !== publishedWork[key],
    )
  ) {
    return fail("work_mismatch");
  }

  const context = value.context;
  if (
    !isPlainObject(context) ||
    !hasOnlyKeys(
      context,
      [
        "localDate",
        "festival",
        "solarTerm",
        "season",
        "timePeriod",
        "weather",
      ],
      ["localDate", "season", "timePeriod", "weather"],
    ) ||
    !dateDistanceIsAllowed(context.localDate, now) ||
    !SEASONS.has(context.season) ||
    !TIME_PERIODS.has(context.timePeriod)
  ) {
    return fail("invalid_context");
  }
  if (
    (context.festival !== undefined &&
      !FESTIVALS.has(context.festival)) ||
    (context.solarTerm !== undefined &&
      !SOLAR_TERMS.has(context.solarTerm))
  ) {
    return fail("invalid_calendar");
  }

  const weather = context.weather;
  const labels =
    isPlainObject(weather) && typeof weather.kind === "string"
      ? WEATHER_LABELS.get(weather.kind)
      : undefined;
  if (
    !isPlainObject(weather) ||
    !hasOnlyKeys(weather, ["kind", "label"]) ||
    !labels?.has(weather.label)
  ) {
    return fail("invalid_weather");
  }

  if (!boundedText(value.fallbackReason, 6, 40)) {
    return fail("invalid_fallback");
  }
  if (
    !isPlainObject(value.constraints) ||
    !hasOnlyKeys(value.constraints, [
      "language",
      "maxCharacters",
      "noNewlines",
      "noDisasterRomanticization",
    ]) ||
    value.constraints.language !== "zh-CN" ||
    value.constraints.maxCharacters !== 40 ||
    value.constraints.noNewlines !== true ||
    value.constraints.noDisasterRomanticization !== true
  ) {
    return fail("invalid_constraints");
  }

  return {
    ok: true,
    value: {
      schemaVersion: "1.1",
      contentVersion: catalog.contentVersion,
      ruleVersion: catalog.ruleVersion,
      work: publishedWork,
      context: {
        localDate: context.localDate,
        festival: context.festival,
        solarTerm: context.solarTerm,
        season: context.season,
        timePeriod: context.timePeriod,
        weather: {
          kind: weather.kind,
          label: weather.label,
        },
      },
    },
  };
}

export function buildReasonPrompt(request) {
  const contextParts = [
    request.context.festival
      ? `传统节日：${request.context.festival}`
      : undefined,
    request.context.solarTerm
      ? `节气：${request.context.solarTerm}`
      : undefined,
    `季节：${request.context.season}`,
    `时段：${request.context.timePeriod}`,
    `天气：${request.context.weather.label}`,
  ].filter(Boolean);

  return [
    "你是“今日诗笺”的文化编辑，只为已经由规则选定的古典诗词写一句推荐理由。",
    "不得改选、替换或新增作品，不补写原文、作者、出处或未经提供的历史事实。",
    "理由使用自然、克制的现代中文，6至40个汉字，不换行，不含网址，不自称模型。",
    "把当天语境与作品摘要建立具体联系；不要使用空泛赞美、命令口吻或营销语言。",
    "即使语境涉及恶劣天气，也不得浪漫化灾害、危险或忽视安全提示。",
    `已选作品：${request.work.dynasty}·${request.work.author}《${request.work.title}》。`,
    `作品摘要：${request.work.summary}`,
    `当天语境：${contextParts.join("；")}。`,
    "只返回符合给定 JSON Schema 的对象。",
  ].join("\n");
}
