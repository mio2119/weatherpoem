import { describe, expect, it } from "vitest";
import { displayedPoemLines } from "./poem-layout";

describe("poem layout", () => {
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
