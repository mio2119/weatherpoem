import type {
  GlanceSize,
  PerformanceWeatherScenario,
  ThemePreference,
  WeatherContext,
} from "../types";

export const OPEN_METEO_LICENSE_URL =
  "https://open-meteo.com/en/license";
const ALLOWED_EXTERNAL_URLS = new Set([OPEN_METEO_LICENSE_URL]);

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function isWindowPresented(): Promise<boolean> {
  if (document.visibilityState !== "visible") return false;
  if (!isTauri()) return true;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    return (await appWindow.isVisible()) && !(await appWindow.isMinimized());
  } catch {
    return false;
  }
}

export interface LaunchContext {
  isAutostart: boolean;
  foregroundPresentation: "clear" | "full-screen" | "unknown";
}

export type WindowMode = "setup" | "glance" | "reading" | "safety";

export interface WindowDimensions {
  width: number;
  height: number;
}

const WINDOW_PRESETS: Record<WindowMode, WindowDimensions> = {
  setup: { width: 430, height: 680 },
  glance: { width: 392, height: 320 },
  reading: { width: 560, height: 720 },
  safety: { width: 430, height: 560 },
};
const GLANCE_WIDTHS: Record<GlanceSize, number> = {
  small: 392,
  medium: 456,
  large: 520,
};

export function windowSizeForMode(
  mode: WindowMode,
  workArea: WindowDimensions,
  savedReadingSize?: WindowDimensions,
  glanceSize: GlanceSize = "small",
): WindowDimensions {
  const validReadingSize =
    savedReadingSize &&
    Number.isFinite(savedReadingSize.width) &&
    Number.isFinite(savedReadingSize.height) &&
    savedReadingSize.width >= 440 &&
    savedReadingSize.height >= 520;
  const desired = mode === "glance"
    ? { ...WINDOW_PRESETS.glance, width: GLANCE_WIDTHS[glanceSize] }
    : mode === "reading" && validReadingSize
    ? savedReadingSize
    : WINDOW_PRESETS[mode];
  return {
    width: Math.max(1, Math.min(desired.width, workArea.width - 32)),
    height: Math.max(1, Math.min(desired.height, workArea.height - 32)),
  };
}

export type FrontendReadyView =
  | "onboarding"
  | "poem"
  | "warning"
  | "content-correction"
  | "error";

export type FrontendReadyMode =
  | "local-onboarding"
  | "live-weather"
  | "cached-weather"
  | "offline-rules"
  | "safety-warning"
  | "content-correction"
  | "error";

export interface FrontendReadyContext {
  view: FrontendReadyView;
  mode: FrontendReadyMode;
  viewRenderStartedAtMs: number;
}

export interface SceneMotionProbe {
  sceneKind: string;
  appReduced: boolean;
  systemReduced: boolean;
  sceneActive: boolean;
  visibilityState: DocumentVisibilityState;
  animationName: string;
  animationDuration: string;
  animationIterationCount: string;
}

export function collectSceneMotionProbe(): SceneMotionProbe | null {
  const paper = document.querySelector<HTMLElement>(".poem-paper[data-scene]");
  if (!paper) return null;
  const animation = window.getComputedStyle(paper, "::before");
  return {
    sceneKind: paper.dataset.scene ?? "",
    appReduced: document.documentElement.dataset.motion === "reduced",
    systemReduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    sceneActive: document.documentElement.dataset.sceneActive === "true",
    visibilityState: document.visibilityState,
    animationName: animation.animationName,
    animationDuration: animation.animationDuration,
    animationIterationCount: animation.animationIterationCount,
  };
}

export function classifyFrontendReady(input: {
  configured: boolean;
  hasError: boolean;
  warning: boolean;
  contentCorrection: boolean;
  hasRecommendation: boolean;
  weatherSource: WeatherContext["source"];
}): Pick<FrontendReadyContext, "view" | "mode"> {
  if (input.hasError) return { view: "error", mode: "error" };
  if (!input.configured) {
    return { view: "onboarding", mode: "local-onboarding" };
  }
  if (input.warning) {
    return { view: "warning", mode: "safety-warning" };
  }
  if (input.contentCorrection) {
    return {
      view: "content-correction",
      mode: "content-correction",
    };
  }
  if (!input.hasRecommendation) {
    return { view: "error", mode: "error" };
  }
  const mode: FrontendReadyMode =
    input.weatherSource === "open-meteo"
      ? "live-weather"
      : input.weatherSource === "cache"
        ? "cached-weather"
        : "offline-rules";
  return { view: "poem", mode };
}

export function shouldRevealOnLaunch(input: {
  isAutostart: boolean;
  foregroundPresentation: LaunchContext["foregroundPresentation"];
  configured: boolean;
  lastHandledDate?: string;
  today: string;
}): boolean {
  if (!input.isAutostart) return true;
  if (input.foregroundPresentation !== "clear") return false;
  if (!input.configured) return true;
  return input.lastHandledDate !== input.today;
}

export async function getLaunchContext(): Promise<LaunchContext> {
  if (!isTauri()) return { isAutostart: false, foregroundPresentation: "clear" };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<LaunchContext>("launch_context");
}

export async function getPerformanceWeatherScenario(): Promise<
  PerformanceWeatherScenario | undefined
> {
  if (!isTauri()) return undefined;
  const { invoke } = await import("@tauri-apps/api/core");
  const value = await invoke<PerformanceWeatherScenario | null>(
    "performance_scenario",
  );
  return value ?? undefined;
}

export async function reportFrontendReady(
  context: FrontendReadyContext,
): Promise<void> {
  if (!isTauri()) return;
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
  const frontendElapsedMs = window.performance.now();
  const viewRenderMs =
    frontendElapsedMs - context.viewRenderStartedAtMs;
  const sceneMotion = context.view === "poem" ? collectSceneMotionProbe() : null;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("report_frontend_ready", {
    frontendElapsedMs,
    readyView: context.view,
    readyMode: context.mode,
    viewRenderMs,
    sceneMotion,
  });
}

export async function showWindow(takeFocus = true): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  if (!takeFocus) await appWindow.setFocusable(false);
  try {
    await appWindow.show();
  } finally {
    if (!takeFocus) await appWindow.setFocusable(true);
  }
  document.documentElement.dataset.sceneActive = "true";
  if (takeFocus) await appWindow.setFocus();
}

export async function positionWindowBottomRight(): Promise<void> {
  if (!isTauri()) return;
  try {
    const [{ PhysicalPosition }, { currentMonitor, getCurrentWindow }] =
      await Promise.all([
        import("@tauri-apps/api/dpi"),
        import("@tauri-apps/api/window"),
      ]);
    const monitor = await currentMonitor();
    if (!monitor) return;
    const appWindow = getCurrentWindow();
    const size = await appWindow.outerSize();
    const workArea = monitor.workArea;
    const margin = 22 * monitor.scaleFactor;
    const x =
      workArea.position.x + workArea.size.width - size.width - margin;
    const y =
      workArea.position.y + workArea.size.height - size.height - margin;
    await appWindow.setPosition(
      new PhysicalPosition(Math.round(x), Math.round(y)),
    );
  } catch (error) {
    console.warn("窗口定位失败，将使用系统默认位置。", error);
  }
}

export async function setWindowMode(
  mode: WindowMode,
  savedReadingSize?: WindowDimensions,
  glanceSize: GlanceSize = "small",
): Promise<void> {
  if (!isTauri()) return;
  const [{ LogicalSize, PhysicalPosition }, windowApi] = await Promise.all([
    import("@tauri-apps/api/dpi"),
    import("@tauri-apps/api/window"),
  ]);
  const appWindow = windowApi.getCurrentWindow();
  const monitor = await windowApi.currentMonitor() ?? await windowApi.primaryMonitor();
  if (!monitor) return;
  const scale = monitor.scaleFactor;
  const area = monitor.workArea;
  const size = windowSizeForMode(
    mode,
    {
      width: area.size.width / scale,
      height: area.size.height / scale,
    },
    savedReadingSize,
    glanceSize,
  );
  await appWindow.setMinSize(null);
  await appWindow.setSize(new LogicalSize(size.width, size.height));
  await appWindow.setResizable(mode === "reading");
  const minimum = mode === "glance"
    ? { width: 320, height: 260 }
    : mode === "reading"
      ? { width: 440, height: 520 }
      : { width: 390, height: 400 };
  await appWindow.setMinSize(
    new LogicalSize(
      Math.min(minimum.width, size.width),
      Math.min(minimum.height, size.height),
    ),
  );

  const physicalSize = await appWindow.outerSize();
  const currentPosition = await appWindow.outerPosition();
  const margin = Math.round(16 * scale);
  const left = area.position.x + margin;
  const top = area.position.y + margin;
  const right = Math.max(left, area.position.x + area.size.width - physicalSize.width - margin);
  const bottom = Math.max(top, area.position.y + area.size.height - physicalSize.height - margin);
  const x = mode === "glance"
    ? right
    : Math.min(right, Math.max(left, currentPosition.x));
  const y = mode === "glance"
    ? bottom
    : Math.min(bottom, Math.max(top, currentPosition.y));
  await appWindow.setPosition(new PhysicalPosition(x, y));
}

export async function fitGlanceWindowHeight(
  requiredHeight: number,
  glanceSize?: GlanceSize,
): Promise<void> {
  if (!isTauri() || !Number.isFinite(requiredHeight)) return;
  const [{ LogicalSize }, windowApi] = await Promise.all([
    import("@tauri-apps/api/dpi"),
    import("@tauri-apps/api/window"),
  ]);
  const appWindow = windowApi.getCurrentWindow();
  const monitor = await windowApi.currentMonitor() ?? await windowApi.primaryMonitor();
  if (!monitor) return;
  const scale = monitor.scaleFactor;
  const current = await appWindow.innerSize();
  const targetWidth = glanceSize
    ? windowSizeForMode(
      "glance",
      {
        width: monitor.workArea.size.width / scale,
        height: monitor.workArea.size.height / scale,
      },
      undefined,
      glanceSize,
    ).width
    : current.width / scale;
  const target = Math.min(
    Math.max(320, Math.ceil(requiredHeight)),
    Math.max(1, Math.floor(monitor.workArea.size.height / scale) - 32),
  );
  if (Math.abs(target - current.height / scale) <= 2 &&
      Math.abs(targetWidth - current.width / scale) <= 2) return;
  await appWindow.setSize(new LogicalSize(targetWidth, target));
  await positionWindowBottomRight();
}

export async function listenForReadingResize(
  callback: (size: WindowDimensions) => void,
): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  return appWindow.onResized(async ({ payload }) => {
    const scale = await appWindow.scaleFactor();
    if (!Number.isFinite(scale) || scale <= 0) return;
    callback({
      width: Math.round(payload.width / scale),
      height: Math.round(payload.height / scale),
    });
  });
}

export async function hideWindow(): Promise<void> {
  if (!isTauri()) return;
  window.dispatchEvent(new Event("weatherpoem:conceal"));
  document.documentElement.dataset.sceneActive = "false";
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return;
  window.dispatchEvent(new Event("weatherpoem:conceal"));
  document.documentElement.dataset.sceneActive = "false";
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().minimize();
}

export async function startWindowDrag(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export interface AutostartSyncResult {
  status: "applied" | "unavailable" | "isolated" | "failed";
  enabled?: boolean;
}

export async function syncAutostart(
  enabled: boolean,
): Promise<AutostartSyncResult> {
  if (!isTauri()) return { status: "unavailable" };
  let autostart: typeof import("@tauri-apps/plugin-autostart") | undefined;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    if (await invoke<boolean>("is_performance_profile")) {
      return { status: "isolated" };
    }
    autostart = await import("@tauri-apps/plugin-autostart");
    const current = await autostart.isEnabled();
    if (enabled && !current) await autostart.enable();
    if (!enabled && current) await autostart.disable();
    const actual = await autostart.isEnabled();
    return {
      status: actual === enabled ? "applied" : "failed",
      enabled: actual,
    };
  } catch (error) {
    console.warn("开机启动设置未能同步。", error);
    try {
      const actual = await autostart?.isEnabled();
      return { status: "failed", enabled: actual };
    } catch {
      return { status: "failed" };
    }
  }
}

export async function openExternal(url: string): Promise<void> {
  if (!ALLOWED_EXTERNAL_URLS.has(url)) {
    throw new Error("外部链接不在 WeatherPoem 允许列表中");
  }
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function openThirdPartyNotices(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_third_party_notices");
}

export async function listenForSettings(
  callback: () => void,
): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen("weatherpoem://open-settings", callback);
}

export async function listenForOpenMain(
  callback: () => void,
): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen("weatherpoem://open-main", callback);
}

export async function listenForConcealMain(
  callback: () => void,
): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen("weatherpoem://conceal-main", callback);
}

export async function listenForExitRequest(
  callback: () => void | Promise<void>,
): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen("weatherpoem://exit-requested", () => {
    void callback();
  });
}

export async function completeAppExit(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("complete_graceful_exit");
}

export function applyTheme(theme: ThemePreference): void {
  const systemDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function applyMotionPreference(reduced: boolean): void {
  document.documentElement.dataset.motion = reduced ? "reduced" : "full";
}
