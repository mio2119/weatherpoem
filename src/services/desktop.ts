import type {
  PerformanceWeatherScenario,
  ThemePreference,
} from "../types";

export const OPEN_METEO_LICENSE_URL =
  "https://open-meteo.com/en/license";
const ALLOWED_EXTERNAL_URLS = new Set([OPEN_METEO_LICENSE_URL]);

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface LaunchContext {
  isAutostart: boolean;
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

export function classifyFrontendReady(input: {
  configured: boolean;
  hasError: boolean;
  warning: boolean;
  contentCorrection: boolean;
  hasRecommendation: boolean;
  weatherSource: "open-meteo" | "cache" | "offline";
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
  configured: boolean;
  lastHandledDate?: string;
  today: string;
}): boolean {
  if (!input.isAutostart || !input.configured) return true;
  return input.lastHandledDate !== input.today;
}

export async function getLaunchContext(): Promise<LaunchContext> {
  if (!isTauri()) return { isAutostart: false };
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
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("report_frontend_ready", {
    frontendElapsedMs,
    readyView: context.view,
    readyMode: context.mode,
    viewRenderMs,
  });
}

export async function showWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  await appWindow.show();
  await appWindow.setFocus();
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

export async function hideWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().minimize();
}

export async function startWindowDrag(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export interface AutostartSyncResult {
  status: "applied" | "unavailable" | "failed";
  enabled?: boolean;
}

export async function syncAutostart(
  enabled: boolean,
): Promise<AutostartSyncResult> {
  if (!isTauri()) return { status: "unavailable" };
  let autostart: typeof import("@tauri-apps/plugin-autostart") | undefined;
  try {
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
