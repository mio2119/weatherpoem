<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
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
  isWindowPresented,
  fitGlanceWindowHeight,
  listenForConcealMain,
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
  RecommendationHistoryItem,
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
let weatherLoadGeneration = 0;
let cardInteractedSinceLoad = false;
const recommendation = ref<Recommendation>();
const replacementInProgress = ref(false);
const dislikeInProgress = ref(false);
const favoriteInProgress = ref(false);
const resetInProgress = ref(false);
const panel = ref<Panel>("card");
const loading = ref(true);
const revealPending = ref(false);
const weatherTransitionPending = ref(false);
const errorMessage = ref("");
const onboardingSaving = ref(false);
const onboardingError = ref("");
const toast = ref("");
const toastElement = ref<HTMLElement>();
const toastRailReserved = ref(false);
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
let revealValidationPromise: Promise<void> | undefined;
let readingResizeTimer: number | undefined;
let stopSettingsListener: (() => void) | undefined;
let stopOpenMainListener: (() => void) | undefined;
let stopConcealMainListener: (() => void) | undefined;
let stopExitRequestListener: (() => void) | undefined;
let stopResizeListener: (() => void) | undefined;
let pilotSessionOpened = false;
let exitInProgress = false;
let windowModeReady = false;
let windowModeTask: Promise<void> = Promise.resolve();
let glanceContentHeight = 320;

function glanceHeightWithStatus(): number {
  return glanceContentHeight + (toastRailReserved.value
    ? Math.ceil(toastElement.value?.getBoundingClientRect().height ?? 42) + 10
    : 0);
}

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
      await setWindowMode(mode, settings.value.readingWindowSize, settings.value.glanceSize);
      if (mode === "glance") {
        await fitGlanceWindowHeight(glanceHeightWithStatus(), settings.value.glanceSize);
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
        return fitGlanceWindowHeight(glanceHeightWithStatus(), settings.value.glanceSize);
      }
    });
  }
}

watch(windowMode, (mode) => {
  if (windowModeReady) void queueWindowMode(mode);
});

watch(toast, async () => {
  if (!toast.value) return;
  await nextTick();
  fitGlanceToContent(glanceContentHeight);
});

function finishToastLeave(): void {
  if (toast.value) return;
  toastRailReserved.value = false;
  fitGlanceToContent(glanceContentHeight);
}

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
  toastRailReserved.value = true;
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

interface DelayedWeatherContext {
  generation: number;
  localDate: string;
  cityId: string;
  hadTodaySelection: boolean;
  historyBeforeDisplay: RecommendationHistoryItem[];
}

async function applyDelayedWeather(
  nextWeather: WeatherContext,
  context: DelayedWeatherContext,
): Promise<void> {
  const isCurrent = () =>
    context.generation === weatherLoadGeneration &&
    context.localDate === calendar.value.localDate &&
    context.localDate === buildCalendarContext().localDate &&
    context.cityId === settings.value.cityId &&
    settings.value.configured &&
    Boolean(repository.value) &&
    Boolean(recommendation.value) &&
    !contentCorrectionPending.value &&
    !errorMessage.value;
  if (!isCurrent()) return;
  const current = recommendation.value!;

  if (nextWeather.shouldSuppressPoem) {
    // Remove the old poem before any asynchronous persistence or announcement.
    weatherTransitionPending.value = true;
    recommendation.value = undefined;
    selectedReadingPoem.value = undefined;
    panel.value = "card";
    weather.value = nextWeather;
    try {
      const suppressedState = {
        localDate: context.localDate,
        state: "alert-suppressed",
        workId: current.poem.id,
        shownAt: new Date().toISOString(),
        contentVersion: CONTENT_VERSION,
        ruleVersion: RULE_VERSION,
      } as const;
      await repository.value!.saveDailyState(suppressedState);
      bootstrap.value.dailyState = suppressedState;
      await recordPilotActivity("warning-suppressed");
    } catch (error) {
      console.error(error);
      errorMessage.value = dailyLoadErrorMessage(error);
    } finally {
      weatherTransitionPending.value = false;
    }
    return;
  }
  if (nextWeather.source !== "open-meteo") return;
  const preservePoem = context.hadTodaySelection ||
    cardInteractedSinceLoad || panel.value !== "card";
  const candidate = recommendPoem({
    poems: preservePoem ? [current.poem] : availablePoems.value,
    calendar: calendar.value,
    weather: nextWeather,
    history: context.historyBeforeDisplay,
    feedback: bootstrap.value.feedback,
    retainedWorkId: preservePoem ? current.poem.id : undefined,
  });
  const enriched = await enrichRecommendationReason(
    candidate,
    calendar.value,
    nextWeather,
  );
  if (!isCurrent() || recommendation.value?.poem.id !== current.poem.id) return;
  const interactedWhilePreparing = cardInteractedSinceLoad || panel.value !== "card";
  const selected = interactedWhilePreparing && enriched.poem.id !== current.poem.id
    ? recommendPoem({
        poems: [current.poem],
        calendar: calendar.value,
        weather: nextWeather,
        history: context.historyBeforeDisplay,
        feedback: bootstrap.value.feedback,
        retainedWorkId: current.poem.id,
      })
    : enriched;
  const changedPoem = selected.poem.id !== current.poem.id;
  if (changedPoem) {
    weatherTransitionPending.value = true;
    try {
      await persistRecommendation(selected, "shown");
      if (!isCurrent() || recommendation.value?.poem.id !== current.poem.id) return;
      weather.value = nextWeather;
      recommendation.value = selected;
      cardInteractedSinceLoad = true;
      showToast("天气信息已到，今日诗句已更新");
    } finally {
      weatherTransitionPending.value = false;
    }
    return;
  }
  weather.value = nextWeather;
  recommendation.value = selected;
  cardInteractedSinceLoad = true;
}

function markCardInteraction(event: Event): void {
  if (loading.value || panel.value !== "card" || !recommendation.value) return;
  if (event.target instanceof Element && event.target.closest(".poem-view")) {
    cardInteractedSinceLoad = true;
  }
}

async function loadToday(
  forceNew = false,
  contentControlChecked = false,
  pendingWeather?: Promise<WeatherContext>,
): Promise<void> {
  weatherLoadGeneration += 1;
  cardInteractedSinceLoad = false;
  const nextCalendar = buildCalendarContext();
  if (nextCalendar.localDate !== calendar.value.localDate) {
    recommendation.value = undefined;
    selectedReadingPoem.value = undefined;
  }
  calendar.value = nextCalendar;
  weather.value = offlineWeather();
  errorMessage.value = "";
  const city = findCity(settings.value.cityId);
  const lateContext: DelayedWeatherContext = {
    generation: weatherLoadGeneration,
    localDate: nextCalendar.localDate,
    cityId: settings.value.cityId,
    hadTodaySelection:
      bootstrap.value.dailyState?.localDate === nextCalendar.localDate &&
      Boolean(bootstrap.value.dailyState.workId),
    historyBeforeDisplay: [...bootstrap.value.history],
  };
  let loadFinished = false;
  let loadSucceeded = false;
  let bufferedDelayedWeather: WeatherContext | undefined;
  const catalogReady = ensurePoemCatalog().then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  try {
    weather.value = await (pendingWeather ?? fetchWeather(city, {
      performanceScenario: performanceWeatherScenario,
      onDelayedWeather: async (delayed) => {
        if (!loadFinished) {
          bufferedDelayedWeather = delayed;
      } else if (loadSucceeded) {
          await applyDelayedWeather(delayed, lateContext);
        }
      },
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
    loadSucceeded = true;
  } finally {
    loadFinished = true;
    if (loadSucceeded && bufferedDelayedWeather) {
      if (bufferedDelayedWeather.shouldSuppressPoem) {
        // Keep the first-use or cross-day loading mask until safety wins.
        await applyDelayedWeather(bufferedDelayedWeather, lateContext);
      } else {
        void applyDelayedWeather(bufferedDelayedWeather, lateContext)
          .catch((error: unknown) => {
            console.warn("迟到的天气信息未能应用。", error);
          });
      }
    }
  }
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
    !revealPending.value &&
    settings.value.configured &&
    panel.value === "card" &&
    document.visibilityState === "visible"
  ) {
    void refreshDateIfChanged();
  }
}

async function handleWindowFocus(): Promise<void> {
  if (!(await isWindowPresented())) return;
  if (revealPending.value) {
    await validateRevealedContent();
  } else {
    checkVisibleDate();
  }
  document.documentElement.dataset.sceneActive =
    (await isWindowPresented()) ? "true" : "false";
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
  if (!workIdToSave || !repository.value || favoriteInProgress.value) return;
  const next = !bootstrap.value.favorites.includes(workIdToSave);
  favoriteInProgress.value = true;
  try {
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
  } catch (error) {
    console.error(error);
    showToast(next ? "收藏未能保存，请再试一次" : "取消收藏未能保存，请再试一次");
  } finally {
    favoriteInProgress.value = false;
  }
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

async function handleSceneVisibilityChange(): Promise<void> {
  const visible = document.visibilityState === "visible";
  if (!visible) {
    handleConcealRequest();
    return;
  }
  if (!(await isWindowPresented())) return;
  if (revealPending.value) await validateRevealedContent();
  document.documentElement.dataset.sceneActive =
    (await isWindowPresented()) ? "true" : "false";
}

function handleConcealRequest(): void {
  // WebView2 can keep document.visibilityState as "visible" after a native hide.
  document.documentElement.dataset.sceneActive = "false";
  revealPending.value = true;
}

async function refreshSafetyOnReveal(): Promise<void> {
  if (!recommendation.value || !repository.value) return;
  const nextWeather = await fetchWeather(findCity(settings.value.cityId), {
    performanceScenario: performanceWeatherScenario,
  });
  if (!nextWeather.shouldSuppressPoem) return;
  const suppressedState = {
    localDate: calendar.value.localDate,
    state: "alert-suppressed",
    workId: recommendation.value.poem.id,
    shownAt: new Date().toISOString(),
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
  } as const;
  await repository.value.saveDailyState(suppressedState);
  bootstrap.value.dailyState = suppressedState;
  weather.value = nextWeather;
  recommendation.value = undefined;
  selectedReadingPoem.value = undefined;
  panel.value = "card";
  await recordPilotActivity("warning-suppressed");
}

function validateRevealedContent(): Promise<void> {
  if (revealValidationPromise) return revealValidationPromise;
  revealPending.value = true;
  revealValidationPromise = (async () => {
    if (!settings.value.configured || !repository.value) return;
    if (!(await refreshDateIfChanged())) {
      const correction = await refreshContentControl();
      if (!correction) {
        if (recommendation.value) await refreshSafetyOnReveal();
        else await loadToday(false, true);
      }
    }
  })()
    .catch((error: unknown) => {
      console.error(error);
      errorMessage.value = dailyLoadErrorMessage(error);
    })
    .finally(() => {
      revealPending.value = false;
      revealValidationPromise = undefined;
    });
  return revealValidationPromise;
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
  if (!repository.value || resetInProgress.value) return;
  resetInProgress.value = true;
  try {
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
  } finally {
    resetInProgress.value = false;
  }
}

async function openMainFromShell(): Promise<void> {
  await validateRevealedContent();
  panel.value = "card";
  document.documentElement.dataset.sceneActive = "true";
}

async function openSettingsFromShell(): Promise<void> {
  loading.value = true;
  try {
    if (revealPending.value) await validateRevealedContent();
    if (!settings.value.configured || panel.value === "settings") return;
    await ensurePoemCatalog();
    panel.value = "settings";
  } catch (error) {
    console.error(error);
    errorMessage.value = "设置暂时未能打开，请稍后再试。";
  } finally {
    loading.value = false;
    document.documentElement.dataset.sceneActive = "true";
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
  let completeInitialLoad: (() => void) | undefined;
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
        const initialLoadCompleted = new Promise<void>((resolve) => {
          completeInitialLoad = resolve;
        });
        const lateContext: DelayedWeatherContext = {
          generation: weatherLoadGeneration + 1,
          localDate: buildCalendarContext().localDate,
          cityId: settings.value.cityId,
          hadTodaySelection:
            bootstrap.value.dailyState?.localDate === buildCalendarContext().localDate &&
            Boolean(bootstrap.value.dailyState.workId),
          historyBeforeDisplay: [...bootstrap.value.history],
        };
        pendingWeather = fetchWeather(findCity(settings.value.cityId), {
          performanceScenario: performanceWeatherScenario,
          onDelayedWeather: async (delayed) => {
            await initialLoadCompleted;
            await applyDelayedWeather(delayed, lateContext);
          },
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
    stopConcealMainListener = await listenForConcealMain(handleConcealRequest);
    stopResizeListener = await listenForReadingResize(handleReadingResize);
    contentControlTimer = window.setInterval(() => {
      if (buildCalendarContext().localDate !== calendar.value.localDate) {
        checkVisibleDate();
      } else if (settings.value.configured) {
        void refreshContentControl();
      }
    }, 30 * 60 * 1000);
    dateCheckTimer = window.setInterval(checkVisibleDate, 60 * 1000);
    window.addEventListener("focus", handleWindowFocus);
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
    completeInitialLoad?.();
    await queueWindowMode(windowMode.value);
    windowModeReady = true;
    if (revealAfterInitialization) {
      await showWindow(revealWithFocus);
      if (windowMode.value === "glance") {
        try {
          await fitGlanceWindowHeight(glanceHeightWithStatus(), settings.value.glanceSize);
        } catch (error) {
          console.warn("窗口显示后未能校准诗笺尺寸。", error);
        }
      }
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
  window.addEventListener("weatherpoem:conceal", handleConcealRequest);
  document.addEventListener("visibilitychange", handleSceneVisibilityChange);
  document.addEventListener("pointerdown", markCardInteraction, true);
  document.addEventListener("keydown", markCardInteraction, true);
  window.matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", handleSystemThemeChange);
  void initialize();
});
onBeforeUnmount(() => {
  weatherLoadGeneration += 1;
  document.documentElement.dataset.sceneActive = "false";
  window.removeEventListener("weatherpoem:conceal", handleConcealRequest);
  document.removeEventListener("visibilitychange", handleSceneVisibilityChange);
  document.removeEventListener("pointerdown", markCardInteraction, true);
  document.removeEventListener("keydown", markCardInteraction, true);
  window.matchMedia("(prefers-color-scheme: dark)")
    .removeEventListener("change", handleSystemThemeChange);
  if (toastTimer) window.clearTimeout(toastTimer);
  if (contentControlTimer) window.clearInterval(contentControlTimer);
  if (dateCheckTimer) window.clearInterval(dateCheckTimer);
  if (readingResizeTimer) window.clearTimeout(readingResizeTimer);
  window.removeEventListener("focus", handleWindowFocus);
  document.removeEventListener("visibilitychange", checkVisibleDate);
  stopSettingsListener?.();
  stopOpenMainListener?.();
  stopConcealMainListener?.();
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

    <div v-if="loading || revealPending || weatherTransitionPending" class="loading-view" aria-live="polite">
      <span class="loading-line" />
      <p>{{ revealPending ? "正在核对今日内容与安全信息" : weatherTransitionPending ? "正在根据最新天气核对诗笺" : "正在择取今日诗句" }}</p>
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
      :resetting="resetInProgress"
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
      :favorite-saving="favoriteInProgress"
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
      :favorite-saving="favoriteInProgress"
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
      :favorite-saving="favoriteInProgress"
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

    <Transition name="toast" @after-leave="finishToastLeave">
      <div v-if="toast" ref="toastElement" class="toast-message" role="status">{{ toast }}</div>
    </Transition>
  </div>
</template>
  PerformanceWeatherScenario,
