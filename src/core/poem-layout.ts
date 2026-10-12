import type { PoemLayout } from "../types";

const CLAUSE_END = new Set(["，", "。", "！", "？", "；", "："]);

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
