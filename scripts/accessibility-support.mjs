const REQUIRED_MANUAL_TESTS = [
  "A11Y-KEYBOARD",
  "A11Y-NARRATOR",
  "A11Y-NVDA",
  "A11Y-HIGH-CONTRAST",
  "A11Y-200-PERCENT",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function linearChannel(value) {
  const channel = Number.parseInt(value, 16) / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  assert(/^#[0-9a-f]{6}$/i.test(hex), `无效颜色：${hex}`);
  const channels = hex.slice(1).match(/../g).map(linearChannel);
  return (
    0.2126 * channels[0] +
    0.7152 * channels[1] +
    0.0722 * channels[2]
  );
}

export function contrastRatio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (
    (Math.max(first, second) + 0.05) /
    (Math.min(first, second) + 0.05)
  );
}

export function validateAccessibilityPlan(plan) {
  assert(plan.schemaVersion === "1.0", "可访问性计划 Schema 不匹配");
  assert(
    plan.baselineVersion === "2026.10-accessibility-v2",
    "可访问性基线版本不匹配",
  );
  assert(
    plan.status ===
      "automatic-baseline-ready-awaiting-manual-system-test",
    "当前计划必须明确等待真实系统测试",
  );

  for (const [name, check] of Object.entries(plan.automaticBaseline)) {
    assert(check.status === "passed", `自动基线未通过：${name}`);
  }
  assert(
    plan.automaticBaseline.zoomReflow.fixedMinimumViewportRemoved ===
      true,
    "200% 回流基线必须移除固定最小视口",
  );
  const reflowObservation =
    plan.automaticBaseline.zoomReflow.browserEquivalentObservation;
  assert(
    reflowObservation.viewport.width === 215 &&
      reflowObservation.viewport.height === 340 &&
      reflowObservation.horizontalOverflow === false &&
      reflowObservation.routeFocus === "passed",
    "200% 等效窄视口观察不完整",
  );
  assert(
    reflowObservation.limitation.includes("不能替代"),
    "等效窄视口观察必须保留真实系统限制",
  );
  assert(
    plan.automaticBaseline.routeFocus.includesDailyCard === true,
    "首次设置完成后必须把焦点交给今日诗笺",
  );
  assert(
    plan.automaticBaseline.highContrastCss.forcedColorsMediaQuery ===
      true,
    "必须提供 forced-colors 样式",
  );
  assert(
    plan.automaticBaseline.reducedMotionCss.systemPreference === true &&
      plan.automaticBaseline.reducedMotionCss.inAppPreference === true,
    "系统与应用内减少动态偏好都必须支持",
  );

  const minimumRatio = plan.automaticBaseline.contrast.minimumRatio;
  assert(minimumRatio >= 4.5, "普通文本对比度门槛不得低于 4.5:1");
  const sceneOverlay = plan.automaticBaseline.contrast.sceneOverlay;
  assert(
    sceneOverlay?.status === "passed" &&
      JSON.stringify(sceneOverlay.themes) === JSON.stringify(["light", "dark"]) &&
      JSON.stringify(sceneOverlay.foregroundTokens) ===
        JSON.stringify(["ink", "muted", "faint", "accent"]),
    "诗境叠色对比度检查范围不完整",
  );
  for (const pair of plan.automaticBaseline.contrast.pairs) {
    const ratio = contrastRatio(pair.foreground, pair.background);
    assert(
      ratio >= minimumRatio,
      `${pair.name} 对比度 ${ratio.toFixed(2)} 低于 ${minimumRatio}:1`,
    );
  }

  assert(
    JSON.stringify(plan.manualSystemTests.map((item) => item.id)) ===
      JSON.stringify(REQUIRED_MANUAL_TESTS),
    "真实系统测试矩阵不完整或顺序改变",
  );
  for (const test of plan.manualSystemTests) {
    assert(
      test.status === "pending" && test.evidence === null,
      `尚未真实执行的 ${test.id} 不得冒充通过`,
    );
  }
  for (const [name, value] of Object.entries(plan.limitations)) {
    assert(value === false, `不得冒充已完成 ${name}`);
  }
  assert(
    plan.result === "partial-awaiting-named-manual-evidence",
    "结果必须保持人工证据待完成",
  );
  return plan;
}
