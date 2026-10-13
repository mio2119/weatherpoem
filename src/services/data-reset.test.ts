import { describe, expect, it, vi } from "vitest";
import type { AppRepository } from "./persistence";
import { clearAllLocalUserData } from "./data-reset";

const autostartMocks = vi.hoisted(() => ({ syncAutostart: vi.fn() }));
vi.mock("./desktop", () => autostartMocks);

function createRepository(): AppRepository {
  return {
    load: vi.fn(),
    saveSettings: vi.fn(),
    saveDailyState: vi.fn(),
    recordDisplay: vi.fn(),
    toggleFavorite: vi.fn(),
    recordFeedback: vi.fn(),
    removeFeedback: vi.fn(),
    savePilotState: vi.fn(),
    clearPilotState: vi.fn(),
    clearUserData: vi.fn().mockResolvedValue(undefined),
  };
}

describe("clearAllLocalUserData", () => {
  it("同时清除持久数据、临时缓存并关闭开机启动", async () => {
    const repository = createRepository();
    const clearTransientCaches = vi.fn();
    const disableAutostart = vi.fn().mockResolvedValue("disabled");

    await expect(clearAllLocalUserData(repository, {
      clearTransientCaches,
      disableAutostart,
    })).resolves.toBe("disabled");

    expect(repository.clearUserData).toHaveBeenCalledOnce();
    expect(clearTransientCaches).toHaveBeenCalledOnce();
    expect(disableAutostart).toHaveBeenCalledOnce();
    expect(disableAutostart.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repository.clearUserData).mock.invocationCallOrder[0]!,
    );
  });

  it("持久数据未能清除时不伪装成完整清除", async () => {
    const repository = createRepository();
    vi.mocked(repository.clearUserData).mockRejectedValue(
      new Error("database locked"),
    );
    const clearTransientCaches = vi.fn();
    const disableAutostart = vi.fn().mockResolvedValue("disabled");

    await expect(
      clearAllLocalUserData(repository, {
        clearTransientCaches,
        disableAutostart,
      }),
    ).rejects.toThrow("database locked");
    expect(clearTransientCaches).not.toHaveBeenCalled();
    expect(disableAutostart).toHaveBeenCalledOnce();
  });

  it("开机启动未能关闭时保留本地资料供用户重试", async () => {
    const repository = createRepository();
    const clearTransientCaches = vi.fn();
    const disableAutostart = vi.fn().mockRejectedValue(
      new Error("access denied"),
    );

    await expect(
      clearAllLocalUserData(repository, {
        clearTransientCaches,
        disableAutostart,
      }),
    ).rejects.toThrow("access denied");
    expect(repository.clearUserData).not.toHaveBeenCalled();
    expect(clearTransientCaches).not.toHaveBeenCalled();
  });

  it("系统报告开机启动关闭失败时不清除资料", async () => {
    const repository = createRepository();
    autostartMocks.syncAutostart.mockResolvedValueOnce({
      status: "failed",
      enabled: true,
    });

    await expect(clearAllLocalUserData(repository))
      .rejects.toThrow("本地资料尚未清除");
    expect(autostartMocks.syncAutostart).toHaveBeenCalledWith(false);
    expect(repository.clearUserData).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "isolated"] as const)(
    "在 %s 环境中清除资料但不声称改变系统启动项",
    async (status) => {
      const repository = createRepository();
      autostartMocks.syncAutostart.mockResolvedValueOnce({ status });

      await expect(clearAllLocalUserData(repository)).resolves.toBe(status);
      expect(repository.clearUserData).toHaveBeenCalledOnce();
    },
  );
});
