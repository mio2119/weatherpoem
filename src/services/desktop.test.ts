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
  listenForExitRequest,
  OPEN_METEO_LICENSE_URL,
  openExternal,
  openThirdPartyNotices,
  shouldRevealOnLaunch,
  syncAutostart,
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

vi.mock("@tauri-apps/plugin-autostart", () => autostartMocks);
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauriMocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauriMocks.listen }));
vi.mock("@tauri-apps/plugin-opener", () => openerMocks);

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
      autostartMocks.isEnabled.mockResolvedValue(current);

      await syncAutostart(requested);

      expect(autostartMocks.enable).toHaveBeenCalledTimes(enables);
      expect(autostartMocks.disable).toHaveBeenCalledTimes(disables);
    },
  );

  it("系统自启接口失败时保留应用设置并记录降级", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    autostartMocks.isEnabled.mockRejectedValue(
      new Error("registry unavailable"),
    );

    await expect(syncAutostart(true)).resolves.toBeUndefined();

    expect(autostartMocks.enable).not.toHaveBeenCalled();
    expect(autostartMocks.disable).not.toHaveBeenCalled();
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
