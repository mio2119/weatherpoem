import type { ContentReview, Poem } from "../types";

export interface ContentIssue {
  workId: string;
  field: string;
  message: string;
}

export interface CatalogValidation {
  published: Poem[];
  issues: ContentIssue[];
}

function compactText(value: string): string {
  return value.replace(/[\s，。！？；：、“”‘’]/g, "");
}

function validatePublishedPoem(
  poem: Poem,
  review: ContentReview,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const required: Array<[keyof Poem, string]> = [
    ["title", "篇名"],
    ["author", "作者"],
    ["dynasty", "朝代"],
    ["literaryForm", "体裁"],
    ["sourceName", "文本来源"],
    ["oneLineSummary", "一句概述"],
    ["culturalBackground", "文化背景"],
    ["contemporaryConnection", "当代连接"],
  ];
  for (const [field, label] of required) {
    const value = poem[field];
    if (typeof value !== "string" || !value.trim()) {
      issues.push({
        workId: poem.id,
        field,
        message: `已发布作品缺少${label}`,
      });
    }
  }
  if (poem.fullText.length === 0 || poem.excerpt.length === 0) {
    issues.push({
      workId: poem.id,
      field: "fullText",
      message: "已发布作品必须同时包含全文和首页摘句",
    });
  } else if (
    poem.fullText.some((line) => !line.trim()) ||
    poem.excerpt.some((line) => !line.trim())
  ) {
    issues.push({
      workId: poem.id,
      field: "fullText",
      message: "全文和首页摘句不能包含空行",
    });
  }
  const normalizedFullText = compactText(poem.fullText.join(""));
  if (
    poem.excerpt.some(
      (line) => !normalizedFullText.includes(compactText(line)),
    )
  ) {
    issues.push({
      workId: poem.id,
      field: "excerpt",
      message: "首页摘句必须能够在全文中找到",
    });
  }
  if (!review.sourceVerified) {
    issues.push({
      workId: poem.id,
      field: "sourceName",
      message: "来源未核验的作品不能发布",
    });
  }
  if (!review.reviewedAt || !review.reviewedBy) {
    issues.push({
      workId: poem.id,
      field: "review",
      message: "已发布作品缺少审核人或审核日期",
    });
  }
  if (poem.quality < 0 || poem.quality > 10) {
    issues.push({
      workId: poem.id,
      field: "quality",
      message: "内容质量分必须在 0 到 10 之间",
    });
  }
  const minimumTextLength: Array<
    [keyof Pick<
      Poem,
      "oneLineSummary" | "culturalBackground" | "contemporaryConnection"
    >, number, string]
  > = [
    ["oneLineSummary", 12, "一句概述"],
    ["culturalBackground", 20, "文化背景"],
    ["contemporaryConnection", 20, "当代连接"],
  ];
  for (const [field, minimum, label] of minimumTextLength) {
    if (compactText(poem[field]).length < minimum) {
      issues.push({
        workId: poem.id,
        field,
        message: `${label}信息量不足，至少需要 ${minimum} 个有效字符`,
      });
    }
  }
  if (
    poem.annotations.length === 0 ||
    poem.annotations.some(
      (annotation) =>
        !annotation.term.trim() || !annotation.explanation.trim(),
    )
  ) {
    issues.push({
      workId: poem.id,
      field: "annotations",
      message: "已发布作品至少需要一条完整注释",
    });
  }
  if (
    poem.tags.festivals.length === 0 &&
    poem.tags.weather.length === 0 &&
    poem.tags.solarTerms.length === 0 &&
    poem.tags.seasons.length === 0
  ) {
    issues.push({
      workId: poem.id,
      field: "tags",
      message: "已发布作品至少需要一个日常情境标签",
    });
  }
  return issues;
}

export function validateCatalog(
  candidates: Poem[],
  reviews: Record<string, ContentReview>,
): CatalogValidation {
  const issues: ContentIssue[] = [];
  const seen = new Set<string>();
  const published: Poem[] = [];

  for (const poem of candidates) {
    if (seen.has(poem.id)) {
      issues.push({
        workId: poem.id,
        field: "id",
        message: "作品标识重复",
      });
      continue;
    }
    seen.add(poem.id);
    const review = reviews[poem.id];
    if (!review) {
      issues.push({
        workId: poem.id,
        field: "review",
        message: "作品缺少草稿、审核、发布或撤回状态",
      });
      continue;
    }
    if (review.workId !== poem.id) {
      issues.push({
        workId: poem.id,
        field: "review.workId",
        message: "审核记录与作品标识不一致",
      });
      continue;
    }
    if (review.status !== "published") continue;
    const poemIssues = validatePublishedPoem(poem, review);
    issues.push(...poemIssues);
    if (poemIssues.length === 0) published.push(poem);
  }

  for (const review of Object.values(reviews)) {
    if (!seen.has(review.workId)) {
      issues.push({
        workId: review.workId,
        field: "review",
        message: "审核记录指向不存在的作品",
      });
    }
  }
  return { published, issues };
}

export function buildPublishedCatalog(
  candidates: Poem[],
  reviews: Record<string, ContentReview>,
): Poem[] {
  const result = validateCatalog(candidates, reviews);
  if (result.issues.length > 0) {
    const details = result.issues
      .map((issue) => `${issue.workId}.${issue.field}: ${issue.message}`)
      .join("\n");
    throw new Error(`诗词内容发布校验失败：\n${details}`);
  }
  return result.published;
}
