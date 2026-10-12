import { syncAutostart } from "./desktop";
import type { AppRepository } from "./persistence";
import { clearWeatherCache } from "./weather";

export interface DataResetDependencies {
  disableAutostart(): Promise<void>;
  clearTransientCaches(): void;
}

const defaultDependencies: DataResetDependencies = {
  disableAutostart: () => syncAutostart(false),
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
