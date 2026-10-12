import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  classifyFrontendReady,
  completeAppExit,
  fitGlanceWindowHeight,
  hideWindow,
  listenForExitRequest,
  minimizeWindow,
  OPEN_METEO_LICENSE_URL,
  openExternal,
  openThirdPartyNotices,
  shouldRevealOnLaunch,
  showWindow,
  setWindowMode,
  syncAutostart,
  windowSizeForMode,
} from "./desktop";

const autostartMocks = vi.hoisted(() => ({
  isEnabled: vi.fn<() => Promise<boolean>>(),
  enable: vi.fn<() => Promise<void>>(),
  disable: vi.fn<() => Promise<void>>(),
}));
const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listen: vi.fn(),
}));
const openerMocks = vi.hoisted(() => ({
  openUrl: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));
const windowMocks = vi.hoisted(() => ({
  show: vi.fn<() => Promise<void>>(),
  hide: vi.fn<() => Promise<void>>(),
  minimize: vi.fn<() => Promise<void>>(),
  setFocus: vi.fn<() => Promise<void>>(),
  setMinSize: vi.fn<() => Promise<void>>(),
  setSize: vi.fn<() => Promise<void>>(),
  setResizable: vi.fn<() => Promise<void>>(),
  outerSize: vi.fn<() => Promise<{ width: number; height: number }>>(),
  outerPosition: vi.fn<() => Promise<{ x: number; y: number }>>(),
  setPosition: vi.fn<() => Promise<void>>(),
  innerSize: vi.fn<() => Promise<{ width: number; height: number }>>(),
}));
const monitorMocks = vi.hoisted(() => ({
  currentMonitor: vi.fn(),
  primaryMonitor: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-autostart", () => autostartMocks);
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauriMocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauriMocks.listen }));
vi.mock("@tauri-apps/plugin-opener", () => openerMocks);
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMocks,
  currentMonitor: monitorMocks.currentMonitor,
  primaryMonitor: monitorMocks.primaryMonitor,
}));
vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalSize: class {
    constructor(public width: number, public height: number) {}
  },
  PhysicalPosition: class {
    constructor(public x: number, public y: number) {}
  },
}));

describe("desktop reveal focus policy", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {}, configurable: true,
    });
    windowMocks.show.mockResolvedValue();
    windowMocks.hide.mockResolvedValue();
    windowMocks.minimize.mockResolvedValue();
    windowMocks.setFocus.mockResolvedValue();
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it("automatic reveal shows the card without requesting focus", async () => {
    await showWindow(false);
    expect(windowMocks.show).toHaveBeenCalledOnce();
    expect(windowMocks.setFocus).not.toHaveBeenCalled();
  });

  it("manual reveal can take focus for keyboard operation", async () => {
    await showWindow(true);
    expect(windowMocks.show).toHaveBeenCalledOnce();
    expect(windowMocks.setFocus).toHaveBeenCalledOnce();
  });

  it("stops scene motion when hidden or minimized", async () => {
    await showWindow(false);
    expect(document.documentElement.dataset.sceneActive).toBe("true");
    await hideWindow();
    expect(document.documentElement.dataset.sceneActive).toBe("false");
    await showWindow(false);
    await minimizeWindow();
    expect(document.documentElement.dataset.sceneActive).toBe("false");
  });
});

describe("window mode geometry", () => {
  it("uses a small glance window and a larger reading window", () => {
    const workArea = { width: 1280, height: 800 };
    expect(windowSizeForMode("glance", workArea)).toEqual({
      width: 392,
      height: 320,
    });
    expect(windowSizeForMode("reading", workArea)).toEqual({
      width: 560,
      height: 720,
    });
  });

  it("keeps setup, safety and reading sizes inside a short work area", () => {
    const workArea = { width: 800, height: 600 };
    expect(windowSizeForMode("setup", workArea)).toEqual({
      width: 430,
      height: 568,
    });
    expect(windowSizeForMode("safety", workArea)).toEqual({
      width: 430,
      height: 560,
    });
    expect(windowSizeForMode("reading", workArea, { width: 900, height: 900 }))
      .toEqual({ width: 768, height: 568 });
  });

  it("rejects an invalid saved reading size", () => {
    expect(windowSizeForMode(
      "reading",
      { width: 1280, height: 800 },
      { width: Number.NaN, height: 10 },
    )).toEqual({ width: 560, height: 720 });
  });

  it("changes one native window between glance and resizable reading", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {}, configurable: true,
    });
    monitorMocks.currentMonitor.mockResolvedValue({
      scaleFactor: 1,
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 1280, height: 800 },
      },
    });
    windowMocks.setMinSize.mockResolvedValue();
    windowMocks.setSize.mockResolvedValue();
    windowMocks.setResizable.mockResolvedValue();
    windowMocks.outerSize.mockResolvedValue({ width: 392, height: 320 });
    windowMocks.outerPosition.mockResolvedValue({ x: 100, y: 100 });
    windowMocks.setPosition.mockResolvedValue();

    await setWindowMode("glance");
    expect(windowMocks.setSize).toHaveBeenCalledWith(
      expect.objectContaining({ width: 392, height: 320 }),
    );
    expect(windowMocks.setResizable).toHaveBeenCalledWith(false);
    expect(windowMocks.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 872, y: 464 }),
    );

    await setWindowMode("reading", { width: 700, height: 700 });
    expect(windowMocks.setSize).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 700, height: 700 }),
    );
    expect(windowMocks.setResizable).toHaveBeenLastCalledWith(true);
    delete window.__TAURI_INTERNALS__;
  });

  it("grows for vertical text and shrinks back for short horizontal text", async () => {
    vi.clearAllMocks();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {}, configurable: true,
    });
    monitorMocks.currentMonitor.mockResolvedValue({
      scaleFactor: 1,
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 1280, height: 800 },
      },
    });
    windowMocks.setSize.mockResolvedValue();
    windowMocks.outerSize.mockResolvedValue({ width: 392, height: 500 });
    windowMocks.setPosition.mockResolvedValue();
    windowMocks.innerSize.mockResolvedValueOnce({ width: 392, height: 320 })
      .mockResolvedValueOnce({ width: 392, height: 500 });

    await fitGlanceWindowHeight(500);
    await fitGlanceWindowHeight(394);
    expect(windowMocks.setSize).toHaveBeenNthCalledWith(
      1, expect.objectContaining({ width: 392, height: 500 }),
    );
    expect(windowMocks.setSize).toHaveBeenNthCalledWith(
      2, expect.objectContaining({ width: 392, height: 394 }),
    );
    delete window.__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });
});

describe("desktop launch policy", () => {
  it("普通手动启动始终显示窗口", () => {
    expect(
      shouldRevealOnLaunch({
        isAutostart: false,
        configured: true,
        lastHandledDate: "2026-07-23",
        today: "2026-07-23",
      }),
    ).toBe(true);
  });

  it("首次设置尚未完成时显示窗口", () => {
    expect(
      shouldRevealOnLaunch({
        isAutostart: true,
        configured: false,
        today: "2026-07-23",
      }),
    ).toBe(true);
  });

  it("开机自启动且当天已经处理时保持托盘静默", () => {
    expect(
      shouldRevealOnLaunch({
        isAutostart: true,
        configured: true,
        lastHandledDate: "2026-07-23",
        today: "2026-07-23",
      }),
    ).toBe(false);
  });

  it("新自然日的开机自启动展示今日诗笺", () => {
    expect(
      shouldRevealOnLaunch({
        isAutostart: true,
        configured: true,
        lastHandledDate: "2026-07-22",
        today: "2026-07-23",
      }),
    ).toBe(true);
  });
});

describe("desktop autostart synchronization", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    autostartMocks.enable.mockResolvedValue();
    autostartMocks.disable.mockResolvedValue();
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it.each([
    {
      requested: true,
      current: false,
      enables: 1,
      disables: 0,
    },
    {
      requested: true,
      current: true,
      enables: 0,
      disables: 0,
    },
    {
      requested: false,
      current: true,
      enables: 0,
      disables: 1,
    },
    {
      requested: false,
      current: false,
      enables: 0,
      disables: 0,
    },
  ])(
    "请求 $requested 且系统状态为 $current 时只执行必要变更",
    async ({ requested, current, enables, disables }) => {
      let actual = current;
      autostartMocks.isEnabled.mockImplementation(async () => actual);
      autostartMocks.enable.mockImplementation(async () => {
        actual = true;
      });
      autostartMocks.disable.mockImplementation(async () => {
        actual = false;
      });

      await expect(syncAutostart(requested)).resolves.toEqual({
        status: "applied",
        enabled: requested,
      });

      expect(autostartMocks.enable).toHaveBeenCalledTimes(enables);
      expect(autostartMocks.disable).toHaveBeenCalledTimes(disables);
    },
  );

  it("系统自启接口失败时报告未知状态而不伪称成功", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    autostartMocks.isEnabled.mockRejectedValue(
      new Error("registry unavailable"),
    );

    await expect(syncAutostart(true)).resolves.toEqual({ status: "failed" });

    expect(autostartMocks.enable).not.toHaveBeenCalled();
    expect(autostartMocks.disable).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it("写入被拒绝时回读并报告系统真实状态", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    autostartMocks.isEnabled.mockResolvedValue(false);
    autostartMocks.enable.mockRejectedValue(new Error("access denied"));

    await expect(syncAutostart(true)).resolves.toEqual({
      status: "failed",
      enabled: false,
    });
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});

describe("desktop frontend ready classification", () => {
  it.each([
    {
      input: {
        configured: false,
        hasError: false,
        warning: false,
        contentCorrection: false,
        hasRecommendation: false,
        weatherSource: "offline" as const,
      },
      expected: { view: "onboarding", mode: "local-onboarding" },
    },
    {
      input: {
        configured: true,
        hasError: false,
        warning: false,
        contentCorrection: false,
        hasRecommendation: true,
        weatherSource: "open-meteo" as const,
      },
      expected: { view: "poem", mode: "live-weather" },
    },
    {
      input: {
        configured: true,
        hasError: false,
        warning: false,
        contentCorrection: false,
        hasRecommendation: true,
        weatherSource: "cache" as const,
      },
      expected: { view: "poem", mode: "cached-weather" },
    },
    {
      input: {
        configured: true,
        hasError: false,
        warning: false,
        contentCorrection: false,
        hasRecommendation: true,
        weatherSource: "offline" as const,
      },
      expected: { view: "poem", mode: "offline-rules" },
    },
    {
      input: {
        configured: true,
        hasError: false,
        warning: true,
        contentCorrection: false,
        hasRecommendation: false,
        weatherSource: "open-meteo" as const,
      },
      expected: { view: "warning", mode: "safety-warning" },
    },
    {
      input: {
        configured: true,
        hasError: false,
        warning: false,
        contentCorrection: true,
        hasRecommendation: false,
        weatherSource: "offline" as const,
      },
      expected: {
        view: "content-correction",
        mode: "content-correction",
      },
    },
  ])("把最终状态识别为 $expected.view/$expected.mode", ({ input, expected }) => {
    expect(classifyFrontendReady(input)).toEqual(expected);
  });

  it("错误优先于其他最终状态", () => {
    expect(
      classifyFrontendReady({
        configured: true,
        hasError: true,
        warning: true,
        contentCorrection: true,
        hasRecommendation: true,
        weatherSource: "open-meteo",
      }),
    ).toEqual({ view: "error", mode: "error" });
  });
});

describe("desktop graceful exit handshake", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    tauriMocks.invoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it("监听原生退出请求并在前端收尾后确认退出", async () => {
    const callback = vi.fn<() => Promise<void>>().mockResolvedValue();
    const unlisten = vi.fn();
    let nativeHandler: (() => void) | undefined;
    tauriMocks.listen.mockImplementation(
      async (_event: string, handler: () => void) => {
        nativeHandler = handler;
        return unlisten;
      },
    );

    const stop = await listenForExitRequest(callback);
    nativeHandler?.();
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    stop();
    expect(unlisten).toHaveBeenCalledOnce();

    await completeAppExit();
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "complete_graceful_exit",
    );
  });
});

describe("desktop trust links", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    tauriMocks.invoke.mockResolvedValue(undefined);
    openerMocks.openUrl.mockResolvedValue();
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it("只允许打开固定的 Open-Meteo 许可页", async () => {
    await openExternal(OPEN_METEO_LICENSE_URL);
    expect(openerMocks.openUrl).toHaveBeenCalledWith(
      OPEN_METEO_LICENSE_URL,
    );

    await expect(
      openExternal("https://example.com/untrusted"),
    ).rejects.toThrow("允许列表");
  });

  it("第三方许可只通过固定原生命令打开打包资源", async () => {
    await openThirdPartyNotices();
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "open_third_party_notices",
    );
  });
});
