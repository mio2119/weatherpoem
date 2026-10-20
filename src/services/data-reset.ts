import { syncAutostart } from "./desktop";
import type { AppRepository } from "./persistence";
import { clearWeatherCache } from "./weather";

export interface DataResetDependencies {
  disableAutostart(): Promise<AutostartResetStatus>;
  clearTransientCaches(): void;
}

export type AutostartResetStatus = "disabled" | "unavailable" | "isolated";
export type DataResetPhase = "autostart" | "storage" | "cache";

export class DataResetError extends Error {
  constructor(
    readonly phase: DataResetPhase,
    readonly autostartStatus: AutostartResetStatus | undefined,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "DataResetError";
    this.cause = cause;
  }
}

export function dataResetFailureMessage(error: unknown): string {
  if (!(error instanceof DataResetError)) {
    return "本次清除未完整完成，请核对个人资料与开机启动状态后重试。";
  }
  if (error.phase === "autostart") {
    return "无法确认开机启动已关闭，本地资料未清除；请重试。";
  }
  if (error.phase === "storage") {
    if (error.autostartStatus === "disabled") {
      return "开机启动已关闭，但本地资料未完整清除；请重试。";
    }
    return "本地资料未完整清除；系统开机启动未修改，请重试。";
  }
  if (error.autostartStatus === "disabled") {
    return "本地资料与开机启动已处理，但天气缓存清理失败；请重试。";
  }
  return "本地资料已处理，但天气缓存清理失败；系统开机启动未修改。";
}

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
  let autostart: AutostartResetStatus;
  try {
    autostart = await dependencies.disableAutostart();
  } catch (error) {
    throw new DataResetError("autostart", undefined, error);
  }
  try {
    await repository.clearUserData();
  } catch (error) {
    throw new DataResetError("storage", autostart, error);
  }
  try {
    dependencies.clearTransientCaches();
  } catch (error) {
    throw new DataResetError("cache", autostart, error);
  }
  return autostart;
}
