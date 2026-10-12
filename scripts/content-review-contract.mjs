export const REVIEW_SCHEMA_VERSION = "1.0";

export const REVIEW_HEADERS = [
  "内容版本",
  "作品ID",
  "篇名",
  "作者",
  "朝代",
  "体裁",
  "当前来源",
  "全文",
  "首页摘句",
  "当前注释",
  "文化背景",
  "当代连接",
  "情境标签",
  "初审人",
  "初审机构",
  "初审日期",
  "权威底本/版本",
  "证据链接/馆藏号",
  "正文核对",
  "作者朝代体裁核对",
  "来源与注释核对",
  "当代连接表达核对",
  "情境标签核对",
  "初审结论",
  "问题说明",
  "修订建议",
  "复核人",
  "复核日期",
  "最终结论",
  "完整性（公式）",
];

export const VERDICT_OPTIONS = ["通过", "有误"];
export const INITIAL_DECISION_OPTIONS = ["通过", "需修订", "撤回"];
export const FINAL_DECISION_OPTIONS = ["通过", "退回修订", "撤回"];

const IMMUTABLE_HEADER_COUNT = 13;
const GENERIC_REVIEWER_PATTERN =
  /WeatherPoem|内容初审|匿名|待定|审核人|reviewer/i;

function normalizeCell(value) {
  return String(value ?? "").trim();
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function isFutureDate(value, today) {
  return value > today;
}

function hasAcceptableEvidence(value) {
  if (value.length < 4) return false;
  if (/^http:\/\//i.test(value)) return false;
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return Boolean(url.hostname);
    } catch {
      return false;
    }
  }
  return true;
}

export function catalogWorkToReviewRow(contentVersion, work) {
  return [
    contentVersion,
    work.id,
    work.title,
    work.author,
    work.dynasty,
    work.literaryForm,
    work.sourceName,
    work.fullText.join("\n"),
    work.excerpt.join("\n"),
    work.annotations
      .map(({ term, explanation }) => `${term}：${explanation}`)
      .join("\n"),
    work.culturalBackground,
    work.contemporaryConnection,
    [
      `节日=${work.tags.festivals.join("、") || "无"}`,
      `天气=${work.tags.weather.join("、") || "无"}`,
      `节气=${work.tags.solarTerms.join("、") || "无"}`,
      `季节=${work.tags.seasons.join("、") || "无"}`,
      `时段=${work.tags.timePeriods.join("、") || "无"}`,
      `情绪=${work.tags.emotions.join("、") || "无"}`,
      `生活=${work.tags.lifeScenes.join("、") || "无"}`,
    ].join("｜"),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
}

export function buildReviewRows(catalog) {
  return catalog.works.map((work) =>
    catalogWorkToReviewRow(catalog.contentVersion, work),
  );
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

export function serializeCsv(rows) {
  return `${rows
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n")}\r\n`;
}

export function buildReviewTemplateCsv(catalog) {
  return serializeCsv([REVIEW_HEADERS, ...buildReviewRows(catalog)]);
}

export function parseCsv(csvText) {
  const source = String(csvText ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      if (cell.length > 0) {
        throw new Error(`CSV 第 ${rows.length + 1} 行存在非法引号`);
      }
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r" && source[index + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      index += 1;
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("CSV 末尾存在未闭合引号");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  while (
    rows.length > 0 &&
    rows.at(-1).every((value) => normalizeCell(value) === "")
  ) {
    rows.pop();
  }
  return rows;
}

function issue(workId, field, message) {
  return { workId, field, message };
}

function validateReviewer(value, field, workId, issues) {
  if (value.length < 2) {
    issues.push(issue(workId, field, "必须填写至少两个字符的具名审核人"));
  } else if (GENERIC_REVIEWER_PATTERN.test(value)) {
    issues.push(issue(workId, field, "不能使用项目名、角色名或匿名值代替具名审核人"));
  }
}

function validateDate(value, field, workId, today, issues) {
  if (!isIsoDate(value)) {
    issues.push(issue(workId, field, "日期必须使用 YYYY-MM-DD 格式"));
  } else if (isFutureDate(value, today)) {
    issues.push(issue(workId, field, "审核日期不能晚于校验当天"));
  }
}

export function validateCompletedReviewCsv(
  csvText,
  catalog,
  options = {},
) {
  const today =
    options.today ?? new Date().toISOString().slice(0, 10);
  const issues = [];
  let parsed;
  try {
    parsed = parseCsv(csvText);
  } catch (error) {
    return {
      contractValid: false,
      releaseReady: false,
      total: catalog.works.length,
      passed: 0,
      needsRevision: 0,
      retracted: 0,
      issues: [
        issue(
          "catalog",
          "csv",
          error instanceof Error ? error.message : "CSV 无法解析",
        ),
      ],
    };
  }

  const [headers = [], ...rows] = parsed;
  if (
    headers.length !== REVIEW_HEADERS.length ||
    REVIEW_HEADERS.some(
      (header, index) => normalizeCell(headers[index]) !== header,
    )
  ) {
    issues.push(
      issue(
        "catalog",
        "headers",
        "表头与审核契约不一致；请直接使用当前版本模板，不要重命名或移动列",
      ),
    );
  }

  const canonicalRows = new Map(
    buildReviewRows(catalog).map((row) => [row[1], row]),
  );
  const submitted = new Map();
  for (const [rowOffset, rawRow] of rows.entries()) {
    const row = Array.from(
      { length: REVIEW_HEADERS.length },
      (_, index) => normalizeCell(rawRow[index]),
    );
    const workId = row[1] || `第${rowOffset + 2}行`;
    if (rawRow.length !== REVIEW_HEADERS.length) {
      issues.push(
        issue(
          workId,
          "columns",
          `应有 ${REVIEW_HEADERS.length} 列，实际为 ${rawRow.length} 列`,
        ),
      );
    }
    if (submitted.has(workId)) {
      issues.push(issue(workId, "作品ID", "审核表中作品ID重复"));
      continue;
    }
    submitted.set(workId, row);
  }

  let passed = 0;
  let needsRevision = 0;
  let retracted = 0;

  for (const [workId, canonical] of canonicalRows) {
    const row = submitted.get(workId);
    if (!row) {
      issues.push(issue(workId, "作品ID", "缺少当前发布目录中的作品"));
      continue;
    }
    for (let index = 0; index < IMMUTABLE_HEADER_COUNT; index += 1) {
      if (row[index] !== normalizeCell(canonical[index])) {
        issues.push(
          issue(
            workId,
            REVIEW_HEADERS[index],
            "只读内容与当前发布目录不一致；如需修订，请先修改源码并重新导出审核包",
          ),
        );
      }
    }

    const [
      reviewer,
      institution,
      reviewDate,
      edition,
      evidence,
      textVerdict,
      metadataVerdict,
      sourceVerdict,
      connectionVerdict,
      tagsVerdict,
      initialDecision,
      problem,
      recommendation,
      secondReviewer,
      secondDate,
      finalDecision,
    ] = row.slice(13, 29);

    validateReviewer(reviewer, "初审人", workId, issues);
    if (institution.length < 2) {
      issues.push(issue(workId, "初审机构", "必须填写审核人所属机构"));
    }
    validateDate(reviewDate, "初审日期", workId, today, issues);
    if (edition.length < 3) {
      issues.push(
        issue(workId, "权威底本/版本", "必须填写可识别的权威底本及版本信息"),
      );
    }
    if (!hasAcceptableEvidence(evidence)) {
      issues.push(
        issue(
          workId,
          "证据链接/馆藏号",
          "必须填写 HTTPS 证据链接或可追溯的馆藏/书目编号",
        ),
      );
    }

    const verdicts = [
      ["正文核对", textVerdict],
      ["作者朝代体裁核对", metadataVerdict],
      ["来源与注释核对", sourceVerdict],
      ["当代连接表达核对", connectionVerdict],
      ["情境标签核对", tagsVerdict],
    ];
    for (const [field, value] of verdicts) {
      if (!VERDICT_OPTIONS.includes(value)) {
        issues.push(
          issue(workId, field, `只能填写：${VERDICT_OPTIONS.join("、")}`),
        );
      }
    }
    if (!INITIAL_DECISION_OPTIONS.includes(initialDecision)) {
      issues.push(
        issue(
          workId,
          "初审结论",
          `只能填写：${INITIAL_DECISION_OPTIONS.join("、")}`,
        ),
      );
    }
    const allVerdictsPass = verdicts.every(([, value]) => value === "通过");
    if (initialDecision === "通过" && !allVerdictsPass) {
      issues.push(
        issue(workId, "初审结论", "存在核对项有误时，初审结论不能为通过"),
      );
    }
    if (
      initialDecision !== "通过" &&
      (problem.length < 2 || recommendation.length < 2)
    ) {
      issues.push(
        issue(
          workId,
          "问题说明/修订建议",
          "需修订或撤回时必须填写问题说明和修订建议",
        ),
      );
    }

    validateReviewer(secondReviewer, "复核人", workId, issues);
    if (reviewer && reviewer === secondReviewer) {
      issues.push(issue(workId, "复核人", "初审人与复核人必须是不同人员"));
    }
    validateDate(secondDate, "复核日期", workId, today, issues);
    if (!FINAL_DECISION_OPTIONS.includes(finalDecision)) {
      issues.push(
        issue(
          workId,
          "最终结论",
          `只能填写：${FINAL_DECISION_OPTIONS.join("、")}`,
        ),
      );
    }
    if (
      finalDecision === "通过" &&
      (initialDecision !== "通过" || !allVerdictsPass)
    ) {
      issues.push(
        issue(
          workId,
          "最终结论",
          "只有五项核对和初审均通过时，复核结论才能为通过",
        ),
      );
    }

    if (finalDecision === "通过") passed += 1;
    else if (finalDecision === "撤回") retracted += 1;
    else needsRevision += 1;
  }

  for (const workId of submitted.keys()) {
    if (!canonicalRows.has(workId)) {
      issues.push(issue(workId, "作品ID", "审核表包含当前发布目录之外的作品"));
    }
  }

  const contractValid = issues.length === 0;
  return {
    contractValid,
    releaseReady:
      contractValid &&
      passed === catalog.works.length &&
      needsRevision === 0 &&
      retracted === 0,
    total: catalog.works.length,
    passed,
    needsRevision,
    retracted,
    issues,
  };
}
