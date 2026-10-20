import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  contrastRatio,
  validateAccessibilityPlan,
} from "./accessibility-support.mjs";

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
  "summary:focus-visible",
  "@media (max-width: 300px)",
  "grid-template-rows: auto minmax(0, 1fr)",
]) {
  if (!css.includes(token)) throw new Error(`样式缺少：${token}`);
}
if (/min-width:\s*360px/.test(css) || /min-height:\s*560px/.test(css)) {
  throw new Error("固定最小视口会破坏 200% 缩放回流");
}
if ((css.match(/summary:focus-visible,/gu) ?? []).length !== 2) {
  throw new Error("折叠说明必须同时覆盖普通与强制颜色下的键盘焦点");
}
if (!css.includes("outline: 2px solid var(--accent)") ||
    !css.includes("outline: 3px solid Highlight")) {
  throw new Error("键盘焦点环须适配普通主题和 Windows 强制颜色主题");
}
for (const pair of plan.automaticBaseline.contrast.pairs) {
  for (const color of [pair.foreground, pair.background]) {
    if (!css.toLowerCase().includes(color.toLowerCase())) {
      throw new Error(`CSS 未使用计划中的对比度颜色：${color}`);
    }
  }
}

function themeTokens(selector) {
  const block = css.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`, "u"))?.[1];
  if (!block) throw new Error(`找不到诗境主题样式：${selector}`);
  const token = (name) => {
    const value = block.match(new RegExp(`--${name}:\\s*([^;]+);`, "u"))?.[1];
    if (!value) throw new Error(`诗境主题缺少颜色：${selector} --${name}`);
    return value.trim();
  };
  return {
    surface: token("surface"),
    ink: token("ink"),
    muted: token("muted"),
    faint: token("faint"),
    accent: token("accent"),
    sceneInk: token("scene-ink"),
  };
}

function strongestSceneBackground(surface, sceneInk) {
  const channels = sceneInk.match(
    /^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*(\d+(?:\.\d+)?)%\)$/u,
  );
  if (!channels || !/^#[0-9a-f]{6}$/iu.test(surface)) {
    throw new Error("无法计算诗境装饰层的最不利背景色");
  }
  const alpha = Number(channels[4]) / 100;
  const background = surface.slice(1).match(/../gu).map((part) =>
    Number.parseInt(part, 16));
  const mixed = background.map((value, index) =>
    Math.round(value * (1 - alpha) + Number(channels[index + 1]) * alpha));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

const sceneRatios = [];
for (const [name, selector] of [
  ["light", ":root"],
  ["dark", ':root\\[data-theme="dark"\\]'],
]) {
  const tokens = themeTokens(selector);
  const background = strongestSceneBackground(tokens.surface, tokens.sceneInk);
  for (const foreground of ["ink", "muted", "faint", "accent"]) {
    const ratio = contrastRatio(tokens[foreground], background);
    sceneRatios.push({ theme: name, foreground, ratio });
    if (ratio < plan.automaticBaseline.contrast.minimumRatio) {
      throw new Error(
        `${name} 诗境 ${foreground} 叠色对比度 ${ratio.toFixed(2)} 低于 4.5:1`,
      );
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
console.log(`诗境叠色最不利组合对比度：${sceneRatios.map((item) =>
  `${item.theme}/${item.foreground} ${item.ratio.toFixed(2)}:1`).join("；")}`);
