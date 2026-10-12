import assert from "node:assert/strict";
import test from "node:test";
import {
  contrastRatio,
  validateAccessibilityPlan,
} from "./accessibility-support.mjs";
import plan from "../review/accessibility-plan.json" with { type: "json" };

function fixture() {
  return structuredClone(plan);
}

test("计划中的普通文本颜色都达到 4.5:1", () => {
  for (const pair of plan.automaticBaseline.contrast.pairs) {
    assert.ok(
      contrastRatio(pair.foreground, pair.background) >= 4.5,
      pair.name,
    );
  }
  assert.doesNotThrow(() => validateAccessibilityPlan(fixture()));
});

test("低对比颜色会被拒绝", () => {
  const invalid = fixture();
  invalid.automaticBaseline.contrast.pairs[0].foreground = "#9a9285";
  assert.throws(
    () => validateAccessibilityPlan(invalid),
    /对比度.*低于/,
  );
});

test("不能用计划文件冒充真实辅助技术验收", () => {
  const fakePass = fixture();
  fakePass.manualSystemTests[0].status = "passed";
  fakePass.manualSystemTests[0].evidence = "self-asserted";
  assert.throws(
    () => validateAccessibilityPlan(fakePass),
    /不得冒充通过/,
  );

  const fakeNarrator = fixture();
  fakeNarrator.limitations.narratorExecuted = true;
  assert.throws(
    () => validateAccessibilityPlan(fakeNarrator),
    /不得冒充已完成 narratorExecuted/,
  );
});
