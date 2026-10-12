import { syncAutostart } from "./desktop";
import type { AppRepository } from "./persistence";
import { clearWeatherCache } from "./weather";

export interface DataResetDependencies {
  disableAutostart(): Promise<void>;
  clearTransientCaches(): void;
}

const defaultDependencies: DataResetDependencies = {
  disableAutostart: async () => {
    const result = await syncAutostart(false);
    if (result.status === "failed") {
      throw new Error("本地数据已清除，但无法确认开机启动已关闭");
    }
  },
  clearTransientCaches: clearWeatherCache,
};

export async function clearAllLocalUserData(
  repository: AppRepository,
  dependencies: DataResetDependencies = defaultDependencies,
): Promise<void> {
  await repository.clearUserData();
  dependencies.clearTransientCaches();
  await dependencies.disableAutostart();
}
