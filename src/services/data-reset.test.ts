import { describe, expect, it, vi } from "vitest";
import type { AppRepository } from "./persistence";
import { clearAllLocalUserData } from "./data-reset";

function createRepository(): AppRepository {
  return {
    load: vi.fn(),
    saveSettings: vi.fn(),
    saveDailyState: vi.fn(),
    recordDisplay: vi.fn(),
    toggleFavorite: vi.fn(),
    recordFeedback: vi.fn(),
    savePilotState: vi.fn(),
    clearPilotState: vi.fn(),
    clearUserData: vi.fn().mockResolvedValue(undefined),
  };
}

describe("clearAllLocalUserData", () => {
  it("同时清除持久数据、临时缓存并关闭开机启动", async () => {
    const repository = createRepository();
    const clearTransientCaches = vi.fn();
    const disableAutostart = vi.fn().mockResolvedValue(undefined);

    await clearAllLocalUserData(repository, {
      clearTransientCaches,
      disableAutostart,
    });

    expect(repository.clearUserData).toHaveBeenCalledOnce();
    expect(clearTransientCaches).toHaveBeenCalledOnce();
    expect(disableAutostart).toHaveBeenCalledOnce();
  });

  it("持久数据未能清除时不伪装成完整清除", async () => {
    const repository = createRepository();
    vi.mocked(repository.clearUserData).mockRejectedValue(
      new Error("database locked"),
    );
    const clearTransientCaches = vi.fn();
    const disableAutostart = vi.fn().mockResolvedValue(undefined);

    await expect(
      clearAllLocalUserData(repository, {
        clearTransientCaches,
        disableAutostart,
      }),
    ).rejects.toThrow("database locked");
    expect(clearTransientCaches).not.toHaveBeenCalled();
    expect(disableAutostart).not.toHaveBeenCalled();
  });
});
