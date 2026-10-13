import { syncAutostart } from "./desktop";
import type { AppRepository } from "./persistence";
import { clearWeatherCache } from "./weather";

export interface DataResetDependencies {
  disableAutostart(): Promise<AutostartResetStatus>;
  clearTransientCaches(): void;
}

export type AutostartResetStatus = "disabled" | "unavailable" | "isolated";

const defaultDependencies: DataResetDependencies = {
  disableAutostart: async () => {
    const result = await syncAutostart(false);
    if (result.status === "failed") {
      throw new Error("无法确认开机启动已关闭；本地资料尚未清除");
    }
    if (result.status === "applied" && result.enabled === false) return "disabled";
    if (result.status === "unavailable") return "unavailable";
    if (result.status === "isolated") return "isolated";
    throw new Error("无法确认开机启动已关闭；本地资料尚未清除");
  },
  clearTransientCaches: clearWeatherCache,
};

export async function clearAllLocalUserData(
  repository: AppRepository,
  dependencies: DataResetDependencies = defaultDependencies,
): Promise<AutostartResetStatus> {
  const autostart = await dependencies.disableAutostart();
  await repository.clearUserData();
  dependencies.clearTransientCaches();
  return autostart;
}
