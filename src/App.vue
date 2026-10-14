<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import ContentCorrectionView from "./components/ContentCorrectionView.vue";
import OnboardingView from "./components/OnboardingView.vue";
import FavoritesPanel from "./components/FavoritesPanel.vue";
import PilotPanel from "./components/PilotPanel.vue";
import PoemCard from "./components/PoemCard.vue";
import ReadingPanel from "./components/ReadingPanel.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import WarningView from "./components/WarningView.vue";
import WindowChrome from "./components/WindowChrome.vue";
import {
  CONTENT_VERSION,
  recommendPoem,
  RULE_VERSION,
} from "./core/recommendation";
import { buildCalendarContext, localDateKey } from "./core/date-context";
import { hasDislikedWorkOnDate, hasReplacedOnDate } from "./core/daily-behavior";
import {
  buildPilotSummary,
  closePilotSession,
  createPilotState,
  recordPilotEvent,
} from "./core/pilot";
import { loadPoemCatalog } from "./data/catalog";
import { findCity } from "./data/cities";
import {
  fetchContentWithdrawals,
  filterWithdrawnWorks,
  shouldShowContentCorrection,
} from "./services/content-control";
import {
  clearAllLocalUserData,
  DataResetError,
  dataResetFailureMessage,
} from "./services/data-reset";
import {
  applyMotionPreference,
  applyTheme,
  classifyFrontendReady,
  completeAppExit,
  getLaunchContext,
  getPerformanceWeatherScenario,
  isTauri,
  fitGlanceWindowHeight,
  listenForOpenMain,
  listenForExitRequest,
  listenForReadingResize,
  listenForSettings,
  reportFrontendReady,
  setWindowMode,
  shouldRevealOnLaunch,
  showWindow,
  syncAutostart,
  type WindowMode,
  type WindowDimensions,
} from "./services/desktop";
import {
  createRepository,
  BrowserStorageUnavailableError,
  DEFAULT_SETTINGS,
  DesktopStorageUnavailableError,
  type AppRepository,
} from "./services/persistence";
import { enrichRecommendationReason } from "./services/reason";
import { fetchWeather } from "./services/weather";
import type {
  AppBootstrap,
  AppSettings,
  CalendarContext,
  FeedbackItem,
  PerformanceWeatherScenario,
  PilotEventType,
  PilotState,
  Recommendation,
  Poem,
  PoemLayout,
  WeatherContext,
} from "./types";

type Panel = "card" | "favorites" | "pilot" | "reading" | "settings";

const repository = shallowRef<AppRepository>();
const bootstrap = ref<AppBootstrap>({
  settings: { ...DEFAULT_SETTINGS },
  history: [],
  favorites: [],
  feedback: [],
});
const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS });
const settingsDraft = ref<AppSettings>({ ...DEFAULT_SETTINGS });
const calendar = ref<CalendarContext>(buildCalendarContext());
const weather = ref<WeatherContext>(offlineWeather());
let performanceWeatherScenario:
  | PerformanceWeatherScenario
  | undefined;
const recommendation = ref<Recommendation>();
const replacementInProgress = ref(false);
const dislikeInProgress = ref(false);
const panel = ref<Panel>("card");
const loading = ref(true);
const errorMessage = ref("");
const onboardingSaving = ref(false);
const onboardingError = ref("");
const toast = ref("");
const autostartWarning = ref("");
const selectedReadingPoem = ref<Poem>();
const poems = shallowRef<Poem[]>([]);
const withdrawnWorkIds = ref<string[]>([]);
const recommendationsSuspended = ref(false);
const contentCorrectionPending = ref(false);
const pilotState = ref<PilotState>();
const readingReturnPanel = ref<"card" | "favorites">("card");
const favoritesReturnPanel = ref<"card" | "settings">("card");
let toastTimer: number | undefined;
let contentControlTimer: number | undefined;
let dateCheckTimer: number | undefined;
let dateRefreshPromise: Promise<boolean> | undefined;
let readingResizeTimer: number | undefined;
let stopSettingsListener: (() => void) | undefined;
let stopOpenMainListener: (() => void) | undefined;
let stopExitRequestListener: (() => void) | undefined;
let stopResizeListener: (() => void) | undefined;
let pilotSessionOpened = false;
let exitInProgress = false;
let windowModeReady = false;
let windowModeTask: Promise<void> = Promise.resolve();
let glanceContentHeight = 320;

const configured = computed(() => settings.value.configured);
const windowMode = computed<WindowMode>(() => {
  if (!configured.value) return "setup";
  if (weather.value.shouldSuppressPoem || contentCorrectionPending.value) {
    return "safety";
  }
  return panel.value === "card" ? "glance" : "reading";
});

function queueWindowMode(mode: WindowMode): Promise<void> {
  windowModeTask = windowModeTask
    .catch(() => undefined)
    .then(async () => {
      await setWindowMode(mode, settings.value.readingWindowSize);
      if (mode === "glance") {
        await fitGlanceWindowHeight(glanceContentHeight);
      }
    })
    .catch((error) => {
      console.warn("窗口尺寸未能按阅读状态调整。", error);
    });
  return windowModeTask;
}

function fitGlanceToContent(height: number): void {
  glanceContentHeight = Math.max(320, height);
  if (windowModeReady && windowMode.value === "glance") {
    void windowModeTask.then(() => {
      if (windowMode.value === "glance") {
        return fitGlanceWindowHeight(glanceContentHeight);
      }
    });
  }
}

watch(windowMode, (mode) => {
  if (windowModeReady) void queueWindowMode(mode);
});

function handleReadingResize(size: WindowDimensions): void {
  if (
    !windowModeReady ||
    panel.value !== "reading" ||
    size.width < 440 ||
    size.height < 520
  ) return;
  if (readingResizeTimer) window.clearTimeout(readingResizeTimer);
  readingResizeTimer = window.setTimeout(() => {
    if (!repository.value || panel.value !== "reading") return;
    const previous = settings.value.readingWindowSize;
    if (previous?.width === size.width && previous.height === size.height) return;
    const next = { ...settings.value, readingWindowSize: size };
    void repository.value.saveSettings(next).then(() => {
      settings.value = next;
      bootstrap.value.settings = next;
    }).catch((error) => {
      console.warn("阅读窗口尺寸未能保存。", error);
    });
  }, 350);
}
const favorite = computed(() => {
  const workId = recommendation.value?.poem.id;
  return workId ? bootstrap.value.favorites.includes(workId) : false;
});
const readingFavorite = computed(() => {
  const workId = selectedReadingPoem.value?.id;
  return workId ? bootstrap.value.favorites.includes(workId) : false;
});
const availablePoems = computed(() =>
  recommendationsSuspended.value
    ? []
    : filterWithdrawnWorks(
        poems.value,
        withdrawnWorkIds.value,
      ),
);
const favoritePoems = computed(() =>
  bootstrap.value.favorites
    .map((workId) => findPoem(workId))
    .filter((poem): poem is Poem => Boolean(poem)),
);
const withdrawnFavoriteIds = computed(() =>
  bootstrap.value.favorites.filter((workId) =>
    withdrawnWorkIds.value.includes(workId),
  ),
);
const latestDislike = computed(() =>
  bootstrap.value.feedback.find((item) => item.type === "disliked"),
);
const latestDislikeTitle = computed(() =>
  findPoem(latestDislike.value?.workId)?.title ?? "最近一首诗",
);
const replacedToday = computed(() =>
  hasReplacedOnDate(bootstrap.value.feedback, calendar.value.localDate),
);
const dislikedCurrentToday = computed(() =>
  recommendation.value
    ? hasDislikedWorkOnDate(
        bootstrap.value.feedback,
        recommendation.value.poem.id,
        calendar.value.localDate,
      )
    : false,
);
const pilotSummary = computed(() =>
  pilotState.value
    ? buildPilotSummary({
        state: pilotState.value,
        appVersion: __APP_VERSION__,
        contentVersion: CONTENT_VERSION,
        ruleVersion: RULE_VERSION,
        generatedOn: calendar.value.localDate,
        autostartEnabled: settings.value.autostart,
      })
    : undefined,
);
const subtitle = computed(() => {
  if (!configured.value) return "把传统文化放回日常";
  if (weather.value.shouldSuppressPoem) return "安全信息优先";
  if (contentCorrectionPending.value) return "内容正在校正";
  return `${findCity(settings.value.cityId).name} · ${calendar.value.lunarLabel}`;
});

function offlineWeather(): WeatherContext {
  return {
    kind: "unknown",
    label: "天气读取中",
    freshness: "unavailable",
    source: "offline",
    warnings: [],
    shouldSuppressPoem: false,
  };
}

function showToast(message: string): void {
  toast.value = message;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = "";
  }, 2400);
}

function dailyLoadErrorMessage(error: unknown): string {
  if (error instanceof DesktopStorageUnavailableError ||
      error instanceof BrowserStorageUnavailableError) {
    return error.message;
  }
  return error instanceof Error &&
    error.message === "当前情境下没有适合推荐的作品"
    ? "今天暂未找到与当前情境贴合的诗词，请稍后再试。"
    : "今日诗笺暂时未能载入，请稍后再试。";
}

async function ensurePoemCatalog(): Promise<void> {
  if (poems.value.length > 0) return;
  poems.value = await loadPoemCatalog();
}

async function recordPilotActivity(
  event: PilotEventType,
  localDate = calendar.value.localDate,
): Promise<void> {
  if (!pilotState.value || !repository.value) return;
  if (event === "app-opened" && pilotSessionOpened) return;
  try {
    const next = recordPilotEvent(
      pilotState.value,
      event,
      localDate,
    );
    if (!next) {
      await repository.value.clearPilotState();
      pilotState.value = undefined;
      bootstrap.value.pilotState = undefined;
      pilotSessionOpened = false;
      return;
    }
    pilotState.value = next;
    bootstrap.value.pilotState = next;
    await repository.value.savePilotState(next);
    if (event === "app-opened") {
      pilotSessionOpened = next.sessions.sessionOpen;
    }
  } catch (error) {
    console.warn("本地试点计数未能写入，不影响诗笺使用。", error);
  }
}

function findPoem(workId?: string): Poem | undefined {
  if (!workId) return undefined;
  return availablePoems.value.find((item) => item.id === workId);
}

function recommendationFor(retained?: Poem): Recommendation {
  return recommendPoem({
    poems: retained ? [retained] : availablePoems.value,
    calendar: calendar.value,
    weather: weather.value,
    history: bootstrap.value.history,
    feedback: bootstrap.value.feedback,
    retainedWorkId: retained?.id,
  });
}

async function persistContentCorrection(
  workId?: string,
): Promise<void> {
  if (!repository.value) return;
  const state = {
    localDate: calendar.value.localDate,
    state: "content-withdrawn",
    workId,
    shownAt: new Date().toISOString(),
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
  } as const;
  await repository.value.saveDailyState(state);
  bootstrap.value.dailyState = state;
}

async function refreshContentControl(
  ignoreCurrentWork = false,
): Promise<boolean> {
  await ensurePoemCatalog();
  const control = await fetchContentWithdrawals(
    poems.value.map((poem) => poem.id),
    CONTENT_VERSION,
    __APP_VERSION__,
  );
  recommendationsSuspended.value =
    control.suspendRecommendations;
  withdrawnWorkIds.value = control.withdrawnWorkIds;
  const selectedReadingWithdrawn = Boolean(
    selectedReadingPoem.value && !findPoem(selectedReadingPoem.value.id),
  );
  const currentWorkId =
    recommendation.value?.poem.id ??
    (bootstrap.value.dailyState?.localDate ===
    calendar.value.localDate
      ? bootstrap.value.dailyState.workId
      : undefined);
  const currentWasWithdrawn =
    !ignoreCurrentWork &&
    shouldShowContentCorrection(
      currentWorkId,
      withdrawnWorkIds.value,
    );
  if (
    currentWasWithdrawn ||
    availablePoems.value.length === 0
  ) {
    recommendation.value = undefined;
    selectedReadingPoem.value = undefined;
    panel.value = "card";
    contentCorrectionPending.value = true;
    if (
      bootstrap.value.dailyState?.state !== "content-withdrawn" ||
      bootstrap.value.dailyState.workId !== currentWorkId
    ) {
      await persistContentCorrection(currentWorkId);
    }
    return true;
  }
  contentCorrectionPending.value = false;
  if (selectedReadingWithdrawn) {
    selectedReadingPoem.value = undefined;
    panel.value = readingReturnPanel.value === "favorites" ? "favorites" : "card";
    showToast("这首诗已从内容库撤回，阅读已关闭。");
  }
  return false;
}

async function persistRecommendation(
  selected: Recommendation,
  state: "shown" | "retained",
): Promise<void> {
  if (!repository.value) return;
  const displayedAt = new Date().toISOString();
  const dailyState = {
    localDate: calendar.value.localDate,
    state,
    workId: selected.poem.id,
    shownAt: displayedAt,
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
  } as const;
  const historyItem = {
    localDate: calendar.value.localDate,
    workId: selected.poem.id,
    author: selected.poem.author,
    primaryContext: selected.primaryContext,
    displayedAt,
  };
  await Promise.all([
    repository.value.saveDailyState(dailyState),
    repository.value.recordDisplay(historyItem),
  ]);
  bootstrap.value.dailyState = dailyState;
  bootstrap.value.history = [
    historyItem,
    ...bootstrap.value.history,
  ].slice(0, 60);
}

async function loadToday(
  forceNew = false,
  contentControlChecked = false,
  pendingWeather?: Promise<WeatherContext>,
): Promise<void> {
  const nextCalendar = buildCalendarContext();
  if (nextCalendar.localDate !== calendar.value.localDate) {
    recommendation.value = undefined;
    selectedReadingPoem.value = undefined;
  }
  calendar.value = nextCalendar;
  weather.value = offlineWeather();
  errorMessage.value = "";
  const city = findCity(settings.value.cityId);
  const catalogReady = ensurePoemCatalog().then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  weather.value = await (pendingWeather ?? fetchWeather(city, {
    performanceScenario: performanceWeatherScenario,
  }));
  if (buildCalendarContext().localDate !== calendar.value.localDate) {
    await loadToday(forceNew);
    return;
  }

  const weatherScenario =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("scenario");
  if (
    weatherScenario === "warning" ||
    weatherScenario === "official-warning"
  ) {
    const official = weatherScenario === "official-warning";
    const demoPublishedAt = new Date();
    const demoExpiresAt = new Date(
      demoPublishedAt.getTime() + 8 * 60 * 60 * 1000,
    );
    weather.value = {
      kind: "thunderstorm",
      label: "雷暴",
      temperature: 27,
      freshness: "fresh",
      source: "open-meteo",
      shouldSuppressPoem: true,
      warnings: [
        {
          id: "demo-warning",
          title: official ? "暴雨黄色预警" : "雷暴天气提示",
          level: "warning",
          description: official
            ? "预计未来六小时部分地区将出现强降水。"
            : "当前天气代码显示雷暴风险，请优先查看当地官方预警。",
          source: official ? "北京市气象台" : "演示场景",
          origin: official ? "official" : "weather-proxy",
          area: official ? "北京市" : undefined,
          publishedAt: official ? demoPublishedAt.toISOString() : undefined,
          expiresAt: official ? demoExpiresAt.toISOString() : undefined,
        },
      ],
    };
  }

  if (weather.value.shouldSuppressPoem) {
    const previousWorkId =
      bootstrap.value.dailyState?.localDate === calendar.value.localDate
        ? bootstrap.value.dailyState.workId
        : undefined;
    const suppressedState = {
      localDate: calendar.value.localDate,
      state: "alert-suppressed",
      workId: previousWorkId,
      shownAt: new Date().toISOString(),
      contentVersion: CONTENT_VERSION,
      ruleVersion: RULE_VERSION,
    } as const;
    await repository.value?.saveDailyState(suppressedState);
    bootstrap.value.dailyState = suppressedState;
    await recordPilotActivity("warning-suppressed");
    return;
  }

  const catalogResult = await catalogReady;
  if (!catalogResult.ok) throw catalogResult.error;
  const contentScenario =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("scenario");
  if (
    !forceNew &&
    (contentScenario === "content-correction" ||
      contentScenario === "content-suspended")
  ) {
    const currentWorkId =
      bootstrap.value.dailyState?.workId ?? poems.value[0]?.id;
    recommendationsSuspended.value =
      contentScenario === "content-suspended";
    withdrawnWorkIds.value = recommendationsSuspended.value
      ? []
      : currentWorkId
        ? [currentWorkId]
        : [];
    recommendation.value = undefined;
    contentCorrectionPending.value = true;
    await persistContentCorrection(currentWorkId);
    panel.value = "card";
    return;
  }
  if (
    !contentControlChecked &&
    (await refreshContentControl(forceNew))
  ) {
    return;
  }
  contentCorrectionPending.value = false;
  const retainedId =
    !forceNew &&
    bootstrap.value.dailyState?.localDate === calendar.value.localDate &&
    (bootstrap.value.dailyState.state === "shown" ||
      bootstrap.value.dailyState.state === "retained" ||
      bootstrap.value.dailyState.state === "alert-suppressed")
      ? bootstrap.value.dailyState.workId
      : undefined;
  const retainedPoem = findPoem(retainedId);
  recommendation.value = await enrichRecommendationReason(
    recommendationFor(retainedPoem),
    calendar.value,
    weather.value,
  );
  if (buildCalendarContext().localDate !== calendar.value.localDate) {
    await loadToday(forceNew);
    return;
  }
  const showReadingScenario =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("scenario") ===
      "reading";
  if (showReadingScenario) {
    selectedReadingPoem.value = recommendation.value.poem;
    readingReturnPanel.value = "card";
    panel.value = "reading";
  } else {
    panel.value = "card";
  }
  await persistRecommendation(
    recommendation.value,
    retainedPoem ? "retained" : "shown",
  );
  await recordPilotActivity("poem-presented");
}

async function refreshDateIfChanged(): Promise<boolean> {
  if (dateRefreshPromise) return dateRefreshPromise;
  const nextCalendar = buildCalendarContext();
  if (nextCalendar.localDate === calendar.value.localDate) return false;
  if (!settings.value.configured || !repository.value) {
    calendar.value = nextCalendar;
    return true;
  }
  dateRefreshPromise = (async () => {
    loading.value = true;
    try {
      await loadToday();
    } catch (error) {
      console.error(error);
      errorMessage.value = dailyLoadErrorMessage(error);
    } finally {
      loading.value = false;
    }
    return true;
  })();
  try {
    return await dateRefreshPromise;
  } finally {
    dateRefreshPromise = undefined;
  }
}

function checkVisibleDate(): void {
  if (
    !loading.value &&
    settings.value.configured &&
    panel.value === "card" &&
    document.visibilityState === "visible"
  ) {
    void refreshDateIfChanged();
  }
}

async function completeOnboarding(next: AppSettings): Promise<void> {
  if (onboardingSaving.value) return;
  onboardingSaving.value = true;
  onboardingError.value = "";
  let saved = false;
  try {
    if (!repository.value) throw new Error("Local repository is not ready");
    await repository.value.saveSettings(next);
    saved = true;
    loading.value = true;
    const sync = await syncAutostart(next.autostart);
    const effective =
      sync.status === "failed" && sync.enabled !== undefined
        ? { ...next, autostart: sync.enabled }
        : next;
    if (effective.autostart !== next.autostart) {
      await repository.value?.saveSettings(effective);
    }
    settings.value = effective;
    settingsDraft.value = { ...effective };
    bootstrap.value.settings = effective;
    applyTheme(effective.theme);
    applyMotionPreference(effective.reduceMotion);
    autostartWarning.value =
      sync.status === "failed"
        ? sync.enabled === undefined
          ? "无法确认系统开机启动状态，请到系统启动项核对。"
          : "开机启动未按所选状态生效，已显示系统当前状态。"
        : sync.status === "unavailable"
          ? "浏览器预览无法设置系统开机启动。"
          : sync.status === "isolated"
            ? "隔离测试不会修改系统开机启动；此处仅保存测试偏好。"
          : "";
    await loadToday(true);
    if (autostartWarning.value) showToast(autostartWarning.value);
  } catch (error) {
    console.error(error);
    if (saved) {
      errorMessage.value = dailyLoadErrorMessage(error);
    } else {
      onboardingError.value = "首次设置未能保存。你的城市选择还在，请再试一次。";
    }
  } finally {
    onboardingSaving.value = false;
    loading.value = false;
  }
}

async function toggleFavorite(workId?: string): Promise<void> {
  const targetWorkId =
    workId ??
    (panel.value === "reading"
      ? selectedReadingPoem.value?.id
      : recommendation.value?.poem.id);
  const workIdToSave = targetWorkId;
  if (!workIdToSave || !repository.value) return;
  const next = !bootstrap.value.favorites.includes(workIdToSave);
  await repository.value.toggleFavorite(workIdToSave, next);
  bootstrap.value.favorites = next
    ? [workIdToSave, ...bootstrap.value.favorites]
    : bootstrap.value.favorites.filter(
        (item) => item !== workIdToSave,
      );
  if (next) {
    await recordPilotActivity("favorite-added");
  }
  showToast(next ? "已收入你的诗笺收藏" : "已取消收藏");
}

async function openDailyReading(): Promise<void> {
  if (await refreshDateIfChanged()) return;
  if (!recommendation.value) return;
  selectedReadingPoem.value = recommendation.value.poem;
  readingReturnPanel.value = "card";
  panel.value = "reading";
  await recordPilotActivity("detail-opened");
}

function openFavoriteReading(poem: Poem): void {
  const available = findPoem(poem.id);
  if (!available) {
    showToast("这首诗已从内容库撤回，不能继续阅读。");
    return;
  }
  selectedReadingPoem.value = available;
  readingReturnPanel.value = "favorites";
  panel.value = "reading";
}

function openFavorites(from: "card" | "settings"): void {
  favoritesReturnPanel.value = from;
  panel.value = "favorites";
}

async function returnFromReading(): Promise<void> {
  if (readingReturnPanel.value === "card") {
    await returnToCard();
  } else {
    panel.value = "favorites";
  }
}

async function returnFromFavorites(): Promise<void> {
  if (favoritesReturnPanel.value === "card") {
    await returnToCard();
  } else {
    panel.value = "settings";
  }
}

function contextTags(selected: Recommendation): string[] {
  return [
    selected.primaryContext,
    ...selected.poem.tags.emotions,
    ...selected.poem.tags.lifeScenes,
  ];
}

async function replacePoem(): Promise<void> {
  if (await refreshDateIfChanged()) return;
  const current = recommendation.value;
  if (
    !current ||
    replacedToday.value ||
    replacementInProgress.value ||
    !repository.value
  ) return;
  const eventTime = new Date();
  if (localDateKey(eventTime) !== calendar.value.localDate) {
    await refreshDateIfChanged();
    return;
  }
  replacementInProgress.value = true;
  try {
    const feedback: FeedbackItem = {
      workId: current.poem.id,
      type: "replaced",
      contextTags: contextTags(current),
      createdAt: eventTime.toISOString(),
      localDate: localDateKey(eventTime),
    };
    const next = await enrichRecommendationReason(
      recommendPoem({
        poems: availablePoems.value,
        calendar: calendar.value,
        weather: weather.value,
        history: bootstrap.value.history,
        feedback: bootstrap.value.feedback,
        excludedWorkId: current.poem.id,
      }),
      calendar.value,
      weather.value,
    );
    if (buildCalendarContext().localDate !== calendar.value.localDate) {
      await refreshDateIfChanged();
      return;
    }
    await repository.value.recordFeedback(feedback);
    bootstrap.value.feedback = [feedback, ...bootstrap.value.feedback];
    recommendation.value = next;
    await persistRecommendation(next, "shown");
    await recordPilotActivity("poem-replaced");
    showToast("已换一首，今天不会再打扰你");
  } finally {
    replacementInProgress.value = false;
  }
}

async function replaceWithdrawnContent(): Promise<void> {
  if (availablePoems.value.length === 0) return;
  loading.value = true;
  try {
    await loadToday(true, true);
    showToast("已换为仍在发布状态的内容");
  } catch (error) {
    console.error(error);
    errorMessage.value = dailyLoadErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

async function dislikePoem(): Promise<void> {
  if (await refreshDateIfChanged()) return;
  const current = recommendation.value;
  if (
    !current ||
    dislikeInProgress.value ||
    hasDislikedWorkOnDate(
      bootstrap.value.feedback,
      current.poem.id,
      calendar.value.localDate,
    ) ||
    !repository.value
  ) return;
  const eventTime = new Date();
  if (localDateKey(eventTime) !== calendar.value.localDate) {
    await refreshDateIfChanged();
    return;
  }
  dislikeInProgress.value = true;
  try {
    const feedback: FeedbackItem = {
      workId: current.poem.id,
      type: "disliked",
      contextTags: contextTags(current),
      createdAt: eventTime.toISOString(),
      localDate: localDateKey(eventTime),
    };
    await repository.value.recordFeedback(feedback);
    bootstrap.value.feedback = [feedback, ...bootstrap.value.feedback];
    await recordPilotActivity("not-relevant");
    showToast("已记下：两周内减少这首诗，可在设置中撤销");
  } catch (error) {
    console.error(error);
    showToast("暂时没能记下反馈，请再试一次");
  } finally {
    dislikeInProgress.value = false;
  }
}

async function undoLatestDislike(): Promise<void> {
  const item = latestDislike.value;
  if (!item || !repository.value) return;
  try {
    await repository.value.removeFeedback(item);
    const index = bootstrap.value.feedback.indexOf(item);
    if (index >= 0) bootstrap.value.feedback.splice(index, 1);
    showToast("已撤销最近一次不太贴合反馈");
  } catch (error) {
    console.error(error);
    showToast("撤销反馈失败，请稍后重试。");
  }
}

async function saveSettings(next: AppSettings): Promise<void> {
  next = { ...next, anonymousMetrics: false };
  const cityChanged = next.cityId !== settings.value.cityId;
  let saved = false;
  try {
    await repository.value?.saveSettings(next);
    saved = true;
    const sync = await syncAutostart(next.autostart);
    const effective =
      sync.status === "failed" && sync.enabled !== undefined
        ? { ...next, autostart: sync.enabled }
        : next;
    if (effective.autostart !== next.autostart) {
      await repository.value?.saveSettings(effective);
    }
    settings.value = effective;
    settingsDraft.value = { ...effective };
    bootstrap.value.settings = effective;
    applyTheme(effective.theme);
    applyMotionPreference(effective.reduceMotion);
    autostartWarning.value =
      sync.status === "failed"
        ? sync.enabled === undefined
          ? "其他设置已保存，但无法确认系统开机启动状态。"
          : "其他设置已保存；开机启动未按所选状态生效，已显示系统当前状态。"
        : sync.status === "unavailable"
          ? "其他设置已保存；浏览器预览无法设置系统开机启动。"
          : sync.status === "isolated"
            ? "其他设置已保存；隔离测试不会修改系统开机启动。"
          : "";
    if (cityChanged) {
      loading.value = true;
      try {
        await loadToday(true);
      } finally {
        loading.value = false;
      }
    }
    if (autostartWarning.value) {
      showToast(autostartWarning.value);
      return;
    }
    panel.value = "card";
    showToast("设置已保存");
  } catch (error) {
    console.error(error);
    if (saved && cityChanged) {
      errorMessage.value = dailyLoadErrorMessage(error);
      panel.value = "card";
      return;
    }
    showToast(
      saved
        ? "部分设置已保存，但诗笺刷新或系统状态确认失败，请重试。"
        : "设置未能保存，请重试。",
    );
  }
}

async function changePoemLayout(layout: PoemLayout): Promise<void> {
  if (settings.value.poemLayout === layout) return;
  const next = { ...settings.value, poemLayout: layout };
  try {
    await repository.value?.saveSettings(next);
    settings.value = next;
    settingsDraft.value = { ...next };
    bootstrap.value.settings = next;
  } catch (error) {
    console.error(error);
    showToast("排版偏好未能保存，请重试。");
  }
}

function handleSystemThemeChange(): void {
  if (settings.value.theme === "system") applyTheme("system");
}

function handleSceneVisibilityChange(): void {
  document.documentElement.dataset.sceneActive =
    document.visibilityState === "visible" ? "true" : "false";
}

async function startPilot(): Promise<void> {
  if (!repository.value || pilotState.value) return;
  let next = createPilotState(calendar.value.localDate);
  next =
    recordPilotEvent(
      next,
      "app-opened",
      calendar.value.localDate,
    ) ?? next;
  if (weather.value.shouldSuppressPoem) {
    next =
      recordPilotEvent(
        next,
        "warning-suppressed",
        calendar.value.localDate,
      ) ?? next;
  } else if (recommendation.value) {
    next =
      recordPilotEvent(
        next,
        "poem-presented",
        calendar.value.localDate,
      ) ?? next;
  }
  await repository.value.savePilotState(next);
  pilotState.value = next;
  bootstrap.value.pilotState = next;
  pilotSessionOpened = next.sessions.sessionOpen;
  showToast("本地试点记录已开始，不会自动上传");
}

async function withdrawPilot(): Promise<void> {
  if (
    !repository.value ||
    !pilotState.value ||
    !window.confirm(
      "确定退出试点并立即删除全部本地聚合记录与同意状态吗？",
    )
  ) {
    return;
  }
  await repository.value.clearPilotState();
  pilotState.value = undefined;
  bootstrap.value.pilotState = undefined;
  pilotSessionOpened = false;
  panel.value = "settings";
  showToast("已退出试点并删除本地记录");
}

async function resetData(): Promise<void> {
  if (
    !window.confirm(
      "确定清除设置、收藏、阅读记录、反馈、试点记录与天气缓存，并关闭开机启动吗？",
    )
  ) {
    return;
  }
  if (!repository.value) return;
  let autostartReset: "disabled" | "unavailable" | "isolated";
  try {
    autostartReset = await clearAllLocalUserData(repository.value);
  } catch (error) {
    console.error(error);
    try {
      bootstrap.value = await repository.value.load();
      settings.value = {
        ...bootstrap.value.settings,
        autostart: error instanceof DataResetError && error.autostartStatus === "disabled"
          ? false
          : bootstrap.value.settings.autostart,
      };
      settingsDraft.value = { ...settings.value };
      bootstrap.value.settings = settings.value;
      autostartWarning.value = dataResetFailureMessage(error);
      showToast(autostartWarning.value);
    } catch (loadError) {
      console.error(loadError);
      errorMessage.value = dailyLoadErrorMessage(loadError);
    }
    return;
  }
  bootstrap.value = {
    settings: { ...DEFAULT_SETTINGS },
    history: [],
    favorites: [],
    feedback: [],
  };
  settings.value = { ...DEFAULT_SETTINGS };
  settingsDraft.value = { ...DEFAULT_SETTINGS };
  autostartWarning.value = "";
  pilotState.value = undefined;
  pilotSessionOpened = false;
  recommendation.value = undefined;
  panel.value = "card";
  applyTheme("system");
  applyMotionPreference(false);
  showToast(
    autostartReset === "disabled"
      ? "本地数据已清除，开机启动已关闭"
      : autostartReset === "isolated"
        ? "隔离测试资料已清除，未修改系统开机启动"
        : "浏览器预览资料已清除，此处没有系统开机启动设置",
  );
}

async function openMainFromShell(): Promise<void> {
  if (settings.value.configured) {
    loading.value = true;
    try {
      const dateChanged = await refreshDateIfChanged();
      if (!dateChanged) {
        const correction = await refreshContentControl();
        if (!correction && !recommendation.value) {
          await loadToday(false, true);
        }
      }
    } catch (error) {
      console.error(error);
      errorMessage.value = dailyLoadErrorMessage(error);
    } finally {
      loading.value = false;
    }
  }
  panel.value = "card";
}

async function openSettingsFromShell(): Promise<void> {
  if (!settings.value.configured) return;
  if (panel.value === "settings") return;
  loading.value = true;
  try {
    await ensurePoemCatalog();
    panel.value = "settings";
  } catch (error) {
    console.error(error);
    errorMessage.value = "设置暂时未能打开，请稍后再试。";
  } finally {
    loading.value = false;
  }
}

async function returnToCard(): Promise<void> {
  settingsDraft.value = { ...settings.value };
  if (await refreshDateIfChanged()) {
    panel.value = "card";
    return;
  }
  if (!recommendation.value && settings.value.configured) {
    await openMainFromShell();
    return;
  }
  panel.value = "card";
}

async function exitFromShell(): Promise<void> {
  if (exitInProgress) return;
  exitInProgress = true;
  try {
    if (
      pilotSessionOpened &&
      pilotState.value &&
      repository.value
    ) {
      const next = closePilotSession(
        pilotState.value,
        buildCalendarContext().localDate,
      );
      if (next) {
        await repository.value.savePilotState(next);
        pilotState.value = next;
        bootstrap.value.pilotState = next;
      }
      pilotSessionOpened = false;
    }
  } catch (error) {
    console.warn(
      "退出前未能确认本地试点会话；下次启动将按异常中断保守计数。",
      error,
    );
  } finally {
    await completeAppExit();
  }
}

async function initialize(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  let revealAfterInitialization = true;
  let revealWithFocus = true;
  let pendingWeather: Promise<WeatherContext> | undefined;
  try {
    const [launchContext, controlledScenario] = await Promise.all([
      getLaunchContext(),
      getPerformanceWeatherScenario(),
    ]);
    performanceWeatherScenario = controlledScenario;
    revealWithFocus = !launchContext.isAutostart;
    repository.value = await createRepository();
    bootstrap.value = await repository.value.load();
    settings.value = { ...bootstrap.value.settings };
    settingsDraft.value = { ...settings.value };
    pilotState.value = bootstrap.value.pilotState;
    const demoScenario =
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get("scenario");
    if (demoScenario === "onboarding") {
      settings.value.configured = false;
    } else {
      revealAfterInitialization = shouldRevealOnLaunch({
        isAutostart: launchContext.isAutostart,
        foregroundPresentation: launchContext.foregroundPresentation,
        configured: settings.value.configured,
        lastHandledDate: bootstrap.value.dailyState?.localDate,
        today: buildCalendarContext().localDate,
      });
      if (settings.value.configured && revealAfterInitialization) {
        pendingWeather = fetchWeather(findCity(settings.value.cityId), {
          performanceScenario: performanceWeatherScenario,
        });
        // 初始化监听器期间天气请求已经开始；失败仍交给 loadToday 处理。
        void pendingWeather.catch(() => undefined);
      }
    }
    stopExitRequestListener ??= await listenForExitRequest(() =>
      exitFromShell(),
    );
    applyTheme(settings.value.theme);
    applyMotionPreference(settings.value.reduceMotion);
    await recordPilotActivity(
      "app-opened",
      buildCalendarContext().localDate,
    );
    stopSettingsListener = await listenForSettings(() => {
      void openSettingsFromShell();
    });
    stopOpenMainListener = await listenForOpenMain(() => {
      void openMainFromShell();
    });
    stopResizeListener = await listenForReadingResize(handleReadingResize);
    contentControlTimer = window.setInterval(() => {
      if (buildCalendarContext().localDate !== calendar.value.localDate) {
        checkVisibleDate();
      } else if (settings.value.configured) {
        void refreshContentControl();
      }
    }, 30 * 60 * 1000);
    dateCheckTimer = window.setInterval(checkVisibleDate, 60 * 1000);
    window.addEventListener("focus", checkVisibleDate);
    document.addEventListener("visibilitychange", checkVisibleDate);

    if (settings.value.configured && revealAfterInitialization) {
      await loadToday(false, false, pendingWeather);
    }
  } catch (error) {
    console.error(error);
    errorMessage.value = dailyLoadErrorMessage(error);
  } finally {
    const viewRenderStartedAtMs = window.performance.now();
    loading.value = false;
    await queueWindowMode(windowMode.value);
    windowModeReady = true;
    if (revealAfterInitialization) {
      await showWindow(revealWithFocus);
      try {
        const ready = classifyFrontendReady({
          configured: configured.value,
          hasError: Boolean(errorMessage.value),
          warning: weather.value.shouldSuppressPoem,
          contentCorrection: contentCorrectionPending.value,
          hasRecommendation: Boolean(recommendation.value),
          weatherSource: weather.value.source,
        });
        await reportFrontendReady({
          ...ready,
          viewRenderStartedAtMs,
        });
      } catch (error) {
        console.warn("性能探针未能记录，不影响正常使用。", error);
      }
    }
  }
}

onMounted(() => {
  document.documentElement.dataset.sceneActive = isTauri() ? "false" : "true";
  document.addEventListener("visibilitychange", handleSceneVisibilityChange);
  window.matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", handleSystemThemeChange);
  void initialize();
});
onBeforeUnmount(() => {
  document.documentElement.dataset.sceneActive = "false";
  document.removeEventListener("visibilitychange", handleSceneVisibilityChange);
  window.matchMedia("(prefers-color-scheme: dark)")
    .removeEventListener("change", handleSystemThemeChange);
  if (toastTimer) window.clearTimeout(toastTimer);
  if (contentControlTimer) window.clearInterval(contentControlTimer);
  if (dateCheckTimer) window.clearInterval(dateCheckTimer);
  if (readingResizeTimer) window.clearTimeout(readingResizeTimer);
  window.removeEventListener("focus", checkVisibleDate);
  document.removeEventListener("visibilitychange", checkVisibleDate);
  stopSettingsListener?.();
  stopOpenMainListener?.();
  stopExitRequestListener?.();
  stopResizeListener?.();
});
</script>

<template>
  <div class="app-shell">
    <WindowChrome
      :subtitle="subtitle"
      @settings="openSettingsFromShell"
    />

    <div v-if="loading" class="loading-view" aria-live="polite">
      <span class="loading-line" />
      <p>正在择取今日诗句</p>
    </div>

    <div v-else-if="errorMessage" class="error-view" role="alert">
      <h1>暂时未能打开</h1>
      <p class="error-view__detail">{{ errorMessage }}</p>
      <button class="primary-button" type="button" @click="initialize">
        再试一次
      </button>
    </div>

    <OnboardingView
      v-else-if="!configured"
      :initial-settings="settings"
      :saving="onboardingSaving"
      :save-error="onboardingError"
      @complete="completeOnboarding"
    />

    <SettingsPanel
      v-else-if="panel === 'settings'"
      :settings="settingsDraft"
      :saved-settings="settings"
      :autostart-warning="autostartWarning"
      :favorite-count="favoritePoems.length"
      :can-undo-feedback="Boolean(latestDislike)"
      :last-feedback-title="latestDislikeTitle"
      :pilot-status="pilotState?.status"
      @back="returnToCard"
      @save="saveSettings"
      @draft-change="settingsDraft = $event"
      @reset="resetData"
      @favorites="openFavorites('settings')"
      @pilot="panel = 'pilot'"
      @undo-feedback="undoLatestDislike"
    />

    <PilotPanel
      v-else-if="panel === 'pilot'"
      :state="pilotState"
      :summary="pilotSummary"
      @back="panel = 'settings'"
      @start="startPilot"
      @withdraw="withdrawPilot"
    />

    <FavoritesPanel
      v-else-if="panel === 'favorites'"
      :poems="favoritePoems"
      :withdrawn-work-ids="withdrawnFavoriteIds"
      :back-label="favoritesReturnPanel === 'card' ? '今日诗笺' : '设置'"
      @back="returnFromFavorites"
      @open="openFavoriteReading"
      @remove="toggleFavorite"
    />

    <WarningView
      v-else-if="weather.shouldSuppressPoem"
      :weather="weather"
    />

    <ContentCorrectionView
      v-else-if="contentCorrectionPending"
      :has-alternative="availablePoems.length > 0"
      :globally-suspended="recommendationsSuspended"
      @replace="replaceWithdrawnContent"
    />

    <ReadingPanel
      v-else-if="panel === 'reading' && selectedReadingPoem"
      :poem="selectedReadingPoem"
      :favorite="readingFavorite"
      :poem-layout="settings.poemLayout"
      :poem-font-size="settings.poemFontSize"
      :back-label="
        readingReturnPanel === 'favorites' ? '我的收藏' : '今日诗笺'
      "
      @back="returnFromReading"
      @favorite="toggleFavorite"
      @layout-change="changePoemLayout"
    />

    <PoemCard
      v-else-if="recommendation"
      :recommendation="recommendation"
      :calendar="calendar"
      :weather="weather"
      :favorite="favorite"
      :favorite-count="favoritePoems.length"
      :can-replace="!replacedToday"
      :replacing="replacementInProgress"
      :can-dislike="!dislikedCurrentToday"
      :disliking="dislikeInProgress"
      :poem-layout="settings.poemLayout"
      :poem-font-size="settings.poemFontSize"
      @read="openDailyReading"
      @favorite="toggleFavorite"
      @favorites="openFavorites('card')"
      @replace="replacePoem"
      @dislike="dislikePoem"
      @height-needed="fitGlanceToContent"
      @layout-change="changePoemLayout"
    />

    <Transition name="toast">
      <div v-if="toast" class="toast-message" role="status">{{ toast }}</div>
    </Transition>
  </div>
</template>
  PerformanceWeatherScenario,
