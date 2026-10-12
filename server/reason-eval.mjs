import {
  parseCsv,
  serializeCsv,
} from "../scripts/content-review-contract.mjs";
import {
  indexCatalog,
  validateReasonRequest,
  validateReasonText,
} from "./reason-contract.mjs";

const EXPECTED_FESTIVALS = [
  "春节",
  "元宵节",
  "清明节",
  "端午节",
  "七夕节",
  "中秋节",
  "重阳节",
  "除夕",
];
const EXPECTED_SOLAR_TERMS = [
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
];
const EXPECTED_WEATHER = [
  "clear",
  "cloudy",
  "overcast",
  "light-rain",
  "rain",
  "heavy-rain",
  "snow",
  "fog",
  "wind",
  "hot",
  "cold",
];
const EXPECTED_SEASONS = [
  "spring",
  "summer",
  "autumn",
  "winter",
];
const EXPECTED_TIME_PERIODS = [
  "morning",
  "day",
  "evening",
  "night",
];
const FOCUSES = new Set([
  "festival",
  "solar-term",
  "weather",
  "time-period",
]);
const HUMAN_HEADERS = [
  "评测版本",
  "场景ID",
  "轮次",
  "评测焦点",
  "作品ID",
  "篇名",
  "语境",
  "生成理由",
  "响应毫秒",
  "自动契约",
  "语境贴合（1-5）",
  "作品准确（1-5）",
  "自然克制（1-5）",
  "事实错误（是/否）",
  "安全问题（是/否）",
  "人工评审人",
  "备注",
];
const GENERIC_REVIEWER =
  /WeatherPoem|内容初审|匿名|待定|评审人|reviewer/i;

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, keys) {
  return (
    isPlainObject(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
}

function shanghaiDate(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(
    parts.map(({ type, value: part }) => [type, part]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function requireCompleteCoverage(values, expected, label, issues) {
  for (const value of expected) {
    if (!values.has(value)) {
      issues.push(`评测集缺少${label}场景：${value}`);
    }
  }
}

function contextText(context) {
  return [
    context.festival ? `节日=${context.festival}` : undefined,
    context.solarTerm ? `节气=${context.solarTerm}` : undefined,
    `季节=${context.season}`,
    `时段=${context.timePeriod}`,
    `天气=${context.weather.label}`,
  ]
    .filter(Boolean)
    .join("｜");
}

export function validateReasonEvalSuite(
  suite,
  rawCatalog,
  now = Date.now(),
) {
  const issues = [];
  const catalog = indexCatalog(rawCatalog);
  if (
    !exactKeys(suite, [
      "schemaVersion",
      "contentVersion",
      "ruleVersion",
      "acceptance",
      "cases",
    ]) ||
    suite.schemaVersion !== "1.0" ||
    suite.contentVersion !== catalog.contentVersion ||
    suite.ruleVersion !== catalog.ruleVersion ||
    !Array.isArray(suite.cases)
  ) {
    return { ok: false, issues: ["评测集根契约或版本无效"] };
  }

  const acceptance = suite.acceptance;
  if (
    !exactKeys(acceptance, [
      "minimumAutomatedPassRate",
      "maximumP95LatencyMs",
      "minimumHumanQualityPassRate",
      "minimumHumanScore",
      "maximumFactualErrors",
      "maximumSafetyIssues",
    ]) ||
    acceptance.minimumAutomatedPassRate !== 1 ||
    !Number.isInteger(acceptance.maximumP95LatencyMs) ||
    acceptance.maximumP95LatencyMs < 1 ||
    acceptance.minimumHumanQualityPassRate < 0.5 ||
    acceptance.minimumHumanQualityPassRate > 1 ||
    !Number.isInteger(acceptance.minimumHumanScore) ||
    acceptance.minimumHumanScore < 1 ||
    acceptance.minimumHumanScore > 5 ||
    !Number.isInteger(acceptance.maximumFactualErrors) ||
    acceptance.maximumFactualErrors < 0 ||
    !Number.isInteger(acceptance.maximumSafetyIssues) ||
    acceptance.maximumSafetyIssues < 0
  ) {
    issues.push("评测验收阈值无效");
  }

  if (suite.cases.length < 47) {
    issues.push("评测集少于 47 个基础覆盖场景");
  }

  const seen = new Set();
  const festivals = new Set();
  const solarTerms = new Set();
  const weather = new Set();
  const seasons = new Set();
  const timePeriods = new Set();
  const entries = [];
  const localDate = shanghaiDate(now);

  for (const item of suite.cases) {
    if (
      !exactKeys(item, [
        "id",
        "focus",
        "workId",
        "context",
        "fallbackReason",
      ]) ||
      typeof item.id !== "string" ||
      !/^[a-z0-9-]{4,80}$/.test(item.id) ||
      !FOCUSES.has(item.focus) ||
      typeof item.workId !== "string" ||
      typeof item.fallbackReason !== "string"
    ) {
      issues.push("评测集包含格式无效的场景");
      continue;
    }
    if (seen.has(item.id)) {
      issues.push(`评测场景标识重复：${item.id}`);
      continue;
    }
    seen.add(item.id);

    const work = catalog.works.get(item.workId);
    if (!work) {
      issues.push(`${item.id} 指向不存在的作品`);
      continue;
    }
    const request = {
      schemaVersion: "1.1",
      contentVersion: catalog.contentVersion,
      ruleVersion: catalog.ruleVersion,
      work,
      context: {
        localDate,
        ...item.context,
      },
      fallbackReason: item.fallbackReason,
      constraints: {
        language: "zh-CN",
        maxCharacters: 40,
        noNewlines: true,
        noDisasterRomanticization: true,
      },
    };
    const validated = validateReasonRequest(request, catalog, now);
    if (!validated.ok) {
      issues.push(`${item.id} 未通过理由请求契约：${validated.code}`);
      continue;
    }

    if (item.context.festival) festivals.add(item.context.festival);
    if (item.context.solarTerm) solarTerms.add(item.context.solarTerm);
    weather.add(item.context.weather.kind);
    seasons.add(item.context.season);
    timePeriods.add(item.context.timePeriod);
    entries.push({
      caseId: item.id,
      focus: item.focus,
      request,
      contextText: contextText(item.context),
    });
  }

  requireCompleteCoverage(
    festivals,
    EXPECTED_FESTIVALS,
    "传统节日",
    issues,
  );
  requireCompleteCoverage(
    solarTerms,
    EXPECTED_SOLAR_TERMS,
    "节气",
    issues,
  );
  requireCompleteCoverage(
    weather,
    EXPECTED_WEATHER,
    "天气",
    issues,
  );
  requireCompleteCoverage(
    seasons,
    EXPECTED_SEASONS,
    "季节",
    issues,
  );
  requireCompleteCoverage(
    timePeriods,
    EXPECTED_TIME_PERIODS,
    "时段",
    issues,
  );

  return {
    ok: issues.length === 0,
    issues,
    catalog,
    entries,
  };
}

function percentile(values, proportion) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.ceil(sorted.length * proportion) - 1,
  );
  return sorted[index];
}

export async function runReasonEvalSuite(options) {
  const repetitions = options.repetitions ?? 1;
  const concurrency = options.concurrency ?? 2;
  if (
    !Number.isInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > 5
  ) {
    throw new Error("repetitions 必须是 1 至 5 的整数");
  }
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 5
  ) {
    throw new Error("concurrency 必须是 1 至 5 的整数");
  }
  if (typeof options.requester !== "function") {
    throw new Error("评测运行器缺少 requester");
  }

  const now = options.now ?? Date.now();
  const validated = validateReasonEvalSuite(
    options.suite,
    options.catalog,
    now,
  );
  if (!validated.ok) {
    throw new Error(`AI 理由评测集无效：\n${validated.issues.join("\n")}`);
  }

  const clock = options.clock ?? (() => performance.now());
  const tasks = validated.entries.flatMap((entry) =>
    Array.from({ length: repetitions }, (_, index) => ({
      ...entry,
      iteration: index + 1,
    })),
  );
  const rows = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= tasks.length) return;
      const task = tasks[index];
      const started = clock();
      let response;
      let result;
      let error;
      try {
        response = await options.requester(task.request);
        if (!(response instanceof Response)) {
          error = "invalid_transport";
        } else if (response.status !== 200) {
          error = `http_${response.status}`;
        } else {
          const payload = await response.json();
          result = validateReasonText(
            payload,
            task.request.work.id,
          );
          if (!result) error = "invalid_response";
        }
      } catch {
        error = "request_failed";
      }
      const latencyMs = Math.max(0, Math.round(clock() - started));
      rows[index] = {
        caseId: task.caseId,
        iteration: task.iteration,
        focus: task.focus,
        workId: task.request.work.id,
        title: task.request.work.title,
        context: task.contextText,
        reason: result?.reason ?? "",
        latencyMs,
        contractPass: Boolean(result),
        error: error ?? "",
      };
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, tasks.length) },
      () => worker(),
    ),
  );

  const successful = rows.filter((row) => row.contractPass);
  const latencies = rows.map((row) => row.latencyMs);
  const successRate =
    rows.length === 0 ? 0 : successful.length / rows.length;
  const metrics = {
    total: rows.length,
    passed: successful.length,
    failed: rows.length - successful.length,
    automatedPassRate: successRate,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    maximumLatencyMs: Math.max(0, ...latencies),
  };
  const automatedAccepted =
    successRate >=
      options.suite.acceptance.minimumAutomatedPassRate &&
    metrics.p95LatencyMs <=
      options.suite.acceptance.maximumP95LatencyMs;

  return {
    schemaVersion: "1.0",
    evalVersion:
      `${options.suite.contentVersion}/${options.suite.ruleVersion}`,
    contentVersion: options.suite.contentVersion,
    ruleVersion: options.suite.ruleVersion,
    repetitions,
    serviceOrigin: options.serviceOrigin ?? "unspecified",
    generatedAt: new Date(now).toISOString(),
    acceptance: options.suite.acceptance,
    metrics,
    automatedAccepted,
    rows,
  };
}

function allowedEvalUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

export function createHttpReasonRequester(options) {
  const endpoint = options.endpoint?.trim();
  const origin = options.origin?.trim();
  const timeoutMs = options.timeoutMs ?? 2500;
  const fetcher = options.fetcher ?? fetch;
  if (!endpoint || !allowedEvalUrl(endpoint)) {
    throw new Error("评测服务必须使用 HTTPS，或本机回环 HTTP");
  }
  if (!origin || origin.length > 200) {
    throw new Error("评测必须提供服务端允许的精确 Origin");
  }
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30_000
  ) {
    throw new Error("评测超时必须是 100 至 30000 毫秒");
  }

  return async (request) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };
}

export function buildHumanReviewCsv(report) {
  const rows = report.rows.map((row) => [
    report.evalVersion,
    row.caseId,
    row.iteration,
    row.focus,
    row.workId,
    row.title,
    row.context,
    row.reason,
    row.latencyMs,
    row.contractPass ? "通过" : "失败",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  return serializeCsv([HUMAN_HEADERS, ...rows]);
}

function normalize(value) {
  return String(value ?? "").trim();
}

export function validateHumanReviewCsv(csvText, report, suite) {
  const issues = [];
  let parsed;
  try {
    parsed = parseCsv(csvText);
  } catch (error) {
    return {
      contractValid: false,
      accepted: false,
      qualityPassRate: 0,
      factualErrors: 0,
      safetyIssues: 0,
      issues: [
        error instanceof Error ? error.message : "人工评审 CSV 无法解析",
      ],
    };
  }
  const [headers = [], ...rows] = parsed;
  if (
    headers.length !== HUMAN_HEADERS.length ||
    HUMAN_HEADERS.some(
      (header, index) => normalize(headers[index]) !== header,
    )
  ) {
    issues.push("人工评审 CSV 表头与当前契约不一致");
  }

  const expectedRows = new Map(
    report.rows.map((row) => {
      const key = `${row.caseId}#${row.iteration}`;
      return [
        key,
        [
          report.evalVersion,
          row.caseId,
          String(row.iteration),
          row.focus,
          row.workId,
          row.title,
          row.context,
          row.reason,
          String(row.latencyMs),
          row.contractPass ? "通过" : "失败",
        ],
      ];
    }),
  );
  const submitted = new Map();
  for (const [rowIndex, raw] of rows.entries()) {
    const row = Array.from(
      { length: HUMAN_HEADERS.length },
      (_, index) => normalize(raw[index]),
    );
    const key = `${row[1]}#${row[2]}`;
    if (raw.length !== HUMAN_HEADERS.length) {
      issues.push(`第 ${rowIndex + 2} 行列数不正确`);
    }
    if (submitted.has(key)) issues.push(`${key} 重复`);
    submitted.set(key, row);
  }

  let qualityPassed = 0;
  let factualErrors = 0;
  let safetyIssues = 0;
  for (const [key, expected] of expectedRows) {
    const row = submitted.get(key);
    if (!row) {
      issues.push(`${key} 缺少人工评审记录`);
      continue;
    }
    for (let index = 0; index < expected.length; index += 1) {
      if (row[index] !== expected[index]) {
        issues.push(`${key}.${HUMAN_HEADERS[index]} 与运行报告不一致`);
      }
    }
    const scores = row.slice(10, 13).map(Number);
    if (
      scores.some(
        (score) =>
          !Number.isInteger(score) || score < 1 || score > 5,
      )
    ) {
      issues.push(`${key} 的三项人工评分必须是 1 至 5 的整数`);
    } else if (
      scores.every(
        (score) => score >= suite.acceptance.minimumHumanScore,
      )
    ) {
      qualityPassed += 1;
    }
    const factual = row[13];
    const safety = row[14];
    if (!["是", "否"].includes(factual)) {
      issues.push(`${key}.事实错误 只能填写“是”或“否”`);
    } else if (factual === "是") factualErrors += 1;
    if (!["是", "否"].includes(safety)) {
      issues.push(`${key}.安全问题 只能填写“是”或“否”`);
    } else if (safety === "是") safetyIssues += 1;
    const reviewer = row[15];
    if (
      reviewer.length < 2 ||
      GENERIC_REVIEWER.test(reviewer)
    ) {
      issues.push(`${key}.人工评审人 必须填写具名评审人`);
    }
  }
  for (const key of submitted.keys()) {
    if (!expectedRows.has(key)) issues.push(`${key} 不属于本次评测运行`);
  }

  const qualityPassRate =
    expectedRows.size === 0 ? 0 : qualityPassed / expectedRows.size;
  const contractValid = issues.length === 0;
  return {
    contractValid,
    accepted:
      contractValid &&
      report.automatedAccepted &&
      qualityPassRate >=
        suite.acceptance.minimumHumanQualityPassRate &&
      factualErrors <= suite.acceptance.maximumFactualErrors &&
      safetyIssues <= suite.acceptance.maximumSafetyIssues,
    qualityPassRate,
    factualErrors,
    safetyIssues,
    issues,
  };
}
