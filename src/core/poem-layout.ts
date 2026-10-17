import type { PoemLayout } from "../types";

const CLAUSE_END = new Set(["，", "。", "！", "？", "；", "："]);
const MAX_GLANCE_VERTICAL_COLUMNS = 6;
const MAX_GLANCE_VERTICAL_COLUMN_CHARACTERS = 8;

/** Keep the source characters and reading order unchanged while forming short vertical columns. */
export function displayedPoemLines(lines: string[], layout: PoemLayout): string[] {
  if (layout === "horizontal") return [...lines];
  return lines.flatMap((line) => {
    const segments: string[] = [];
    let segment = "";
    for (const character of line) {
      segment += character;
      if (CLAUSE_END.has(character)) {
        segments.push(segment);
        segment = "";
      }
    }
    if (segment) segments.push(segment);
    return segments;
  });
}

/** A compact card has no horizontal poem scroller; preserve the whole excerpt by falling back. */
export function glancePoemLayout(lines: string[], preferred: PoemLayout): PoemLayout {
  if (preferred === "horizontal") return preferred;
  const columns = displayedPoemLines(lines, "vertical");
  return columns.length <= MAX_GLANCE_VERTICAL_COLUMNS &&
    columns.every((column) =>
      Array.from(column).length <= MAX_GLANCE_VERTICAL_COLUMN_CHARACTERS,
    )
    ? "vertical"
    : "horizontal";
}
