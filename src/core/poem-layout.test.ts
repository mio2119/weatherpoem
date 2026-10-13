import { describe, expect, it } from "vitest";
import { POEMS } from "../data/poems";
import { displayedPoemLines, glancePoemLayout } from "./poem-layout";

describe("poem layout", () => {
  it("keeps all published excerpts inside the compact vertical layout budget", () => {
    const rows = POEMS.map((poem) => {
      const columns = displayedPoemLines(poem.excerpt, "vertical");
      return {
        id: poem.id,
        columns: columns.length,
        longest: Math.max(...columns.map((column) => Array.from(column).length)),
      };
    });
    expect(rows).toHaveLength(120);
    expect(Math.max(...rows.map((row) => row.columns))).toBe(6);
    expect(Math.max(...rows.map((row) => row.longest))).toBe(8);
    for (const poem of POEMS) {
      expect(glancePoemLayout(poem.excerpt, "vertical"), poem.id).toBe("vertical");
    }
  });

  it("uses complete horizontal text for overlong or overly wide future excerpts", () => {
    const longUnpunctuated = ["江天万里云水相接连绵不绝"];
    const tooManyColumns = ["甲，乙，丙，丁，戊，己，庚。"];
    expect(glancePoemLayout(longUnpunctuated, "vertical")).toBe("horizontal");
    expect(glancePoemLayout(tooManyColumns, "vertical")).toBe("horizontal");
    expect(glancePoemLayout(longUnpunctuated, "horizontal")).toBe("horizontal");
    expect(displayedPoemLines(longUnpunctuated, "horizontal").join(""))
      .toBe(longUnpunctuated.join(""));
  });
  it("preserves every character and source order in both orientations", () => {
    const lines = [
      "昔人已乘黄鹤去，此地空余黄鹤楼。",
      "白日依山尽，黄河入海流。",
      "《九月九日》：2026年，登高？",
      "无标点长句",
    ];
    expect(displayedPoemLines(lines, "horizontal")).toEqual(lines);
    const vertical = displayedPoemLines(lines, "vertical");
    expect(vertical.join("")).toBe(lines.join(""));
    expect(vertical).toEqual([
      "昔人已乘黄鹤去，", "此地空余黄鹤楼。",
      "白日依山尽，", "黄河入海流。",
      "《九月九日》：", "2026年，", "登高？", "无标点长句",
    ]);
  });
});
