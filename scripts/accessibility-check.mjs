import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { validateAccessibilityPlan } from "./accessibility-support.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const plan = JSON.parse(
  await readFile(
    path.join(projectRoot, "review", "accessibility-plan.json"),
    "utf8",
  ),
);
validateAccessibilityPlan(plan);

const css = await readFile(
  path.join(projectRoot, "src", "styles.css"),
  "utf8",
);
for (const token of [
  "@media (forced-colors: active)",
  "@media (prefers-contrast: more)",
  "@media (prefers-reduced-motion: reduce)",
  ':root[data-motion="reduced"]',
  "@media (max-width: 300px)",
  "grid-template-rows: auto minmax(0, 1fr)",
]) {
  if (!css.includes(token)) throw new Error(`样式缺少：${token}`);
}
if (/min-width:\s*360px/.test(css) || /min-height:\s*560px/.test(css)) {
  throw new Error("固定最小视口会破坏 200% 缩放回流");
}
for (const pair of plan.automaticBaseline.contrast.pairs) {
  for (const color of [pair.foreground, pair.background]) {
    if (!css.toLowerCase().includes(color.toLowerCase())) {
      throw new Error(`CSS 未使用计划中的对比度颜色：${color}`);
    }
  }
}

const focusImplementation = path.join(
  projectRoot,
  plan.automaticBaseline.routeFocus.implementation,
);
const focusTest = path.join(
  projectRoot,
  plan.automaticBaseline.routeFocus.test,
);
await Promise.all([access(focusImplementation), access(focusTest)]);
const focusSource = await readFile(focusImplementation, "utf8");
if (
  !focusSource.includes("preventScroll: true") ||
  !focusSource.includes(".focus(")
) {
  throw new Error("页面进入焦点实现不完整");
}

for (const componentPath of [
  ...plan.automaticBaseline.screenReaderSemantics.components,
  "src/components/SettingsPanel.vue",
  "src/components/PilotPanel.vue",
  "src/components/FavoritesPanel.vue",
  "src/components/OnboardingView.vue",
]) {
  const source = await readFile(path.join(projectRoot, componentPath), "utf8");
  if (
    !source.includes("aria-label") &&
    !source.includes("aria-labelledby")
  ) {
    throw new Error(`${componentPath} 缺少可访问名称`);
  }
}

console.log(
  "可访问性自动基线通过：焦点、语义、对比度、窄视口回流、高对比和减少动态已检查；讲述人、NVDA、真实对比度主题与 200% 系统测试仍待具名人工执行。",
);
