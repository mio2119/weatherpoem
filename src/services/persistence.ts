import type {
  AppBootstrap,
  AppSettings,
  DailyState,
  FeedbackItem,
  PilotState,
  RecommendationHistoryItem,
} from "../types";
import { normalizePilotState } from "../core/pilot";
import { localDateKey } from "../core/date-context";

export const DEFAULT_SETTINGS: AppSettings = {
  configured: false,
  cityId: "beijing",
  autostart: true,
  anonymousMetrics: false,
  theme: "system",
  reduceMotion: false,
  poemLayout: "horizontal",
  poemFontSize: "medium",
};

export class DesktopStorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super("本地资料暂时无法读取。为保护收藏和设置，已停止载入；请勿清除资料。稍后重试，若持续失败请联系维护者。");
    this.name = "DesktopStorageUnavailableError";
    this.cause = cause;
  }
}

export class BrowserStorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super("浏览器本地资料暂时无法读取。为保护收藏和设置，已停止载入；原始资料未被覆盖。请勿清除站点数据，联系维护者修复后再试一次。");
    this.name = "BrowserStorageUnavailableError";
    this.cause = cause;
  }
}

export interface AppRepository {
  load(): Promise<AppBootstrap>;
  saveSettings(settings: AppSettings): Promise<void>;
  saveDailyState(state: DailyState): Promise<void>;
  recordDisplay(item: RecommendationHistoryItem): Promise<void>;
  toggleFavorite(workId: string, active: boolean): Promise<void>;
  recordFeedback(item: FeedbackItem): Promise<void>;
  removeFeedback(item: FeedbackItem): Promise<void>;
  savePilotState(state: PilotState): Promise<void>;
  clearPilotState(): Promise<void>;
  clearUserData(): Promise<void>;
}

interface BrowserData {
  settings: AppSettings;
  dailyState?: DailyState;
  history: RecommendationHistoryItem[];
  favorites: string[];
  feedback: FeedbackItem[];
}

const STORAGE_KEY = "weatherpoem.local.v1";
const PILOT_STORAGE_KEY = "weatherpoem.pilot.v1";

function todayLocalDate(): string {
  return localDateKey(new Date());
}

function emptyData(): BrowserData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    history: [],
    favorites: [],
    feedback: [],
  };
}

function normalizeSettings(candidate: Partial<AppSettings> | undefined): AppSettings {
  const settings = { ...DEFAULT_SETTINGS, ...candidate };
  if (settings.poemLayout !== "horizontal" && settings.poemLayout !== "vertical") {
    settings.poemLayout = DEFAULT_SETTINGS.poemLayout;
  }
  if (!["small", "medium", "large"].includes(settings.poemFontSize)) {
    settings.poemFontSize = DEFAULT_SETTINGS.poemFontSize;
  }
  return settings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(record: Record<string, unknown>, key: string): boolean {
  return !(key in record) || record[key] === undefined ||
    typeof record[key] === "string";
}

function isStoredSettings(value: unknown): value is Partial<AppSettings> {
  if (!isRecord(value) || typeof value.configured !== "boolean" ||
      !isNonEmptyString(value.cityId)) return false;
  for (const key of ["autostart", "anonymousMetrics", "reduceMotion"]) {
    if (key in value && typeof value[key] !== "boolean") return false;
  }
  if ("theme" in value && !["system", "light", "dark"].includes(value.theme as string)) {
    return false;
  }
  // Unknown strings for the newer layout preferences still use the documented fallback.
  if (!isOptionalString(value, "poemLayout") || !isOptionalString(value, "poemFontSize")) {
    return false;
  }
  if ("readingWindowSize" in value) {
    const size = value.readingWindowSize;
    if (!isRecord(size) || typeof size.width !== "number" ||
        !Number.isFinite(size.width) || size.width <= 0 ||
        typeof size.height !== "number" || !Number.isFinite(size.height) ||
        size.height <= 0) return false;
  }
  return true;
}

function isStoredDailyState(value: unknown): value is DailyState {
  return isRecord(value) && isNonEmptyString(value.localDate) &&
    typeof value.state === "string" &&
    ["idle", "shown", "retained", "alert-suppressed", "content-withdrawn"].includes(value.state) &&
    isNonEmptyString(value.contentVersion) && isNonEmptyString(value.ruleVersion) &&
    isOptionalString(value, "workId") && isOptionalString(value, "shownAt");
}

function isStoredHistoryItem(value: unknown): value is RecommendationHistoryItem {
  return isRecord(value) && isNonEmptyString(value.localDate) &&
    isNonEmptyString(value.workId) && typeof value.author === "string" &&
    typeof value.primaryContext === "string" && isOptionalString(value, "displayedAt");
}

function isBrowserFeedbackItem(value: unknown): value is FeedbackItem {
  return isRecord(value) && isNonEmptyString(value.workId) &&
    (value.type === "disliked" || value.type === "replaced") &&
    Array.isArray(value.contextTags) &&
    value.contextTags.every((tag: unknown) => typeof tag === "string") &&
    isNonEmptyString(value.createdAt) && isOptionalString(value, "localDate");
}

function parseStoredSettings(raw: string): AppSettings {
  const candidate: unknown = JSON.parse(raw);
  if (!isStoredSettings(candidate)) {
    throw new Error("Stored settings are invalid");
  }
  return normalizeSettings(candidate);
}

function parseBrowserData(raw: string | null): BrowserData {
  if (raw === null) return emptyData();
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Browser data root is invalid");
  }
  const data = parsed as Record<string, unknown>;
  if (!isStoredSettings(data.settings) ||
      ("dailyState" in data && !isStoredDailyState(data.dailyState)) ||
      ("history" in data && (!Array.isArray(data.history) ||
        !data.history.every(isStoredHistoryItem))) ||
      ("favorites" in data && (!Array.isArray(data.favorites) ||
        !data.favorites.every(isNonEmptyString))) ||
      ("feedback" in data && (!Array.isArray(data.feedback) ||
        !data.feedback.every(isBrowserFeedbackItem)))) {
    throw new Error("Browser data fields are invalid");
  }
  const validData = data as unknown as Partial<BrowserData>;
  return {
    settings: normalizeSettings(validData.settings),
    dailyState: validData.dailyState,
    history: validData.history ?? [],
    favorites: validData.favorites ?? [],
    feedback: validData.feedback ?? [],
  };
}

class BrowserRepository implements AppRepository {
  private read(): BrowserData {
    if (typeof localStorage === "undefined") return emptyData();
    try {
      return parseBrowserData(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      throw new BrowserStorageUnavailableError(error);
    }
  }

  private write(data: BrowserData): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  async load(): Promise<AppBootstrap> {
    const data = this.read();
    if (typeof localStorage === "undefined") return data;
    const rawPilot = localStorage.getItem(PILOT_STORAGE_KEY);
    if (!rawPilot) return data;
    try {
      const pilotState = normalizePilotState(
        JSON.parse(rawPilot) as unknown,
        todayLocalDate(),
      );
      if (!pilotState) {
        localStorage.removeItem(PILOT_STORAGE_KEY);
        return data;
      }
      return { ...data, pilotState };
    } catch {
      localStorage.removeItem(PILOT_STORAGE_KEY);
      return data;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const data = this.read();
    data.settings = { ...settings };
    this.write(data);
  }

  async saveDailyState(state: DailyState): Promise<void> {
    const data = this.read();
    data.dailyState = { ...state };
    this.write(data);
  }

  async recordDisplay(item: RecommendationHistoryItem): Promise<void> {
    const data = this.read();
    data.history = [item, ...data.history].slice(0, 60);
    this.write(data);
  }

  async toggleFavorite(workId: string, active: boolean): Promise<void> {
    const data = this.read();
    if (active) {
      if (!data.favorites.includes(workId)) {
        data.favorites = [workId, ...data.favorites];
      }
    } else {
      data.favorites = data.favorites.filter((item) => item !== workId);
    }
    this.write(data);
  }

  async recordFeedback(item: FeedbackItem): Promise<void> {
    const data = this.read();
    data.feedback = [item, ...data.feedback].slice(0, 100);
    this.write(data);
  }

  async removeFeedback(item: FeedbackItem): Promise<void> {
    const data = this.read();
    const index = data.feedback.findIndex(
      (entry) =>
        entry.workId === item.workId &&
        entry.type === item.type &&
        entry.createdAt === item.createdAt,
    );
    if (index >= 0) {
      data.feedback.splice(index, 1);
      this.write(data);
    }
  }

  async savePilotState(state: PilotState): Promise<void> {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PILOT_STORAGE_KEY, JSON.stringify(state));
    }
  }

  async clearPilotState(): Promise<void> {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(PILOT_STORAGE_KEY);
    }
  }

  async clearUserData(): Promise<void> {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PILOT_STORAGE_KEY);
    }
  }
}

type SqlValues = Array<string | number | null>;

interface SqlDatabase {
  execute(
    query: string,
    bindValues?: SqlValues,
  ): Promise<{ rowsAffected: number }>;
  select<T>(query: string, bindValues?: SqlValues): Promise<T>;
}

interface ValueRow {
  value: string;
}

interface DailyRow {
  local_date: string;
  state: DailyState["state"];
  work_id: string | null;
  shown_at: string | null;
  content_version: string;
  rule_version: string;
}

interface HistoryRow {
  local_date: string;
  work_id: string;
  author: string;
  primary_context: string;
  displayed_at: string | null;
}

interface FavoriteRow {
  work_id: string;
}

interface FeedbackRow {
  work_id: string;
  type: FeedbackItem["type"];
  context_tags: string;
  created_at: string;
  local_date: string | null;
}

function parseFeedbackRow(row: FeedbackRow): FeedbackItem {
  if (!isNonEmptyString(row.work_id) ||
      (row.type !== "disliked" && row.type !== "replaced") ||
      !isNonEmptyString(row.created_at) ||
      (row.local_date !== null && typeof row.local_date !== "string")) {
    throw new Error("Stored feedback fields are invalid");
  }
  const contextTags: unknown = JSON.parse(row.context_tags);
  if (!Array.isArray(contextTags) ||
      !contextTags.every((tag: unknown) => typeof tag === "string")) {
    throw new Error("Stored feedback tags are invalid");
  }
  return {
    workId: row.work_id,
    type: row.type,
    contextTags,
    createdAt: row.created_at,
    localDate: row.local_date ?? undefined,
  };
}

class SqliteRepository implements AppRepository {
  private constructor(private readonly db: SqlDatabase) {}

  static async create(): Promise<SqliteRepository> {
    const [{ default: Database }, { invoke }] = await Promise.all([
      import("@tauri-apps/plugin-sql"),
      import("@tauri-apps/api/core"),
    ]);
    const databaseUrl = await invoke<string>("database_url");
    if (!databaseUrl.startsWith("sqlite:")) {
      throw new Error("桌面数据库地址不合法");
    }
    const db = (await Database.load(databaseUrl)) as SqlDatabase;
    const repository = new SqliteRepository(db);
    await repository.migrate();
    return repository;
  }

  private async migrate(): Promise<void> {
    await this.db.execute(
      "CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
    );
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS daily_state (
        local_date TEXT PRIMARY KEY NOT NULL,
        state TEXT NOT NULL,
        work_id TEXT,
        shown_at TEXT,
        content_version TEXT NOT NULL,
        rule_version TEXT NOT NULL
      )`,
    );
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS recommendation_history (
        local_date TEXT PRIMARY KEY NOT NULL,
        work_id TEXT NOT NULL,
        author TEXT NOT NULL,
        primary_context TEXT NOT NULL
      )`,
    );
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS recommendation_display_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_date TEXT NOT NULL,
        work_id TEXT NOT NULL,
        author TEXT NOT NULL,
        primary_context TEXT NOT NULL,
        displayed_at TEXT
      )`,
    );
    // The old table has one row per day. Preserve each row once, without
    // claiming that its original display time or replaced poem is recoverable.
    await this.db.execute(
      `INSERT INTO recommendation_display_events
       (local_date, work_id, author, primary_context, displayed_at)
       SELECT h.local_date, h.work_id, h.author, h.primary_context, NULL
       FROM recommendation_history h
       WHERE NOT EXISTS (
         SELECT 1 FROM recommendation_display_events e
         WHERE e.local_date = h.local_date AND e.work_id = h.work_id
           AND e.displayed_at IS NULL
       ) ORDER BY h.local_date ASC`,
    );
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS favorites (
        work_id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL
      )`,
    );
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_id TEXT NOT NULL,
        type TEXT NOT NULL,
        context_tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        local_date TEXT
      )`,
    );
    const feedbackColumns = await this.db.select<Array<{ name: string }>>(
      "PRAGMA table_info(feedback)",
    );
    if (!feedbackColumns.some((column) => column.name === "local_date")) {
      await this.db.execute("ALTER TABLE feedback ADD COLUMN local_date TEXT");
    }
    await this.db.execute(
      `CREATE TABLE IF NOT EXISTS user_data_reset (
        id INTEGER PRIMARY KEY CHECK (id = 1)
      )`,
    );
    // The SQL plugin executes each call through a pool. A trigger keeps all
    // deletions inside one SQLite statement, so a failed delete rolls back all.
    await this.db.execute(
      `CREATE TRIGGER IF NOT EXISTS weatherpoem_clear_user_data_v1
       AFTER INSERT ON user_data_reset
       BEGIN
         DELETE FROM app_kv;
         DELETE FROM daily_state;
         DELETE FROM recommendation_history;
         DELETE FROM recommendation_display_events;
         DELETE FROM favorites;
         DELETE FROM feedback;
         DELETE FROM user_data_reset;
       END`,
    );
  }

  async load(): Promise<AppBootstrap> {
    const settingsRows = await this.db.select<ValueRow[]>(
      "SELECT value FROM app_kv WHERE key = $1 LIMIT 1",
      ["settings"],
    );
    const pilotRows = await this.db.select<ValueRow[]>(
      "SELECT value FROM app_kv WHERE key = $1 LIMIT 1",
      ["pilotState"],
    );
    const dailyRows = await this.db.select<DailyRow[]>(
      "SELECT * FROM daily_state ORDER BY local_date DESC LIMIT 1",
    );
    const historyRows = await this.db.select<HistoryRow[]>(
      "SELECT local_date, work_id, author, primary_context, displayed_at FROM recommendation_display_events ORDER BY id DESC LIMIT 60",
    );
    const favoriteRows = await this.db.select<FavoriteRow[]>(
      "SELECT work_id FROM favorites ORDER BY created_at DESC",
    );
    const feedbackRows = await this.db.select<FeedbackRow[]>(
      "SELECT work_id, type, context_tags, created_at, local_date FROM feedback ORDER BY id DESC LIMIT 100",
    );

    let settings = { ...DEFAULT_SETTINGS };
    if (settingsRows.length > 0) {
      try {
        const rawSettings = settingsRows[0]?.value;
        if (typeof rawSettings !== "string") throw new Error("Stored settings are missing");
        settings = parseStoredSettings(rawSettings);
      } catch (error) {
        throw new DesktopStorageUnavailableError(error);
      }
    }
    let storedData: Pick<AppBootstrap, "dailyState" | "history" | "favorites" | "feedback">;
    try {
      const daily = dailyRows[0];
      const dailyState = daily
        ? {
            localDate: daily.local_date,
            state: daily.state,
            workId: daily.work_id ?? undefined,
            shownAt: daily.shown_at ?? undefined,
            contentVersion: daily.content_version,
            ruleVersion: daily.rule_version,
          }
        : undefined;
      const history = historyRows.map((row) => ({
        localDate: row.local_date,
        workId: row.work_id,
        author: row.author,
        primaryContext: row.primary_context,
        displayedAt: row.displayed_at ?? undefined,
      }));
      const favorites = favoriteRows.map((row) => row.work_id);
      if ((dailyState && !isStoredDailyState(dailyState)) ||
          !history.every(isStoredHistoryItem) ||
          !favorites.every(isNonEmptyString)) {
        throw new Error("Stored daily state, history or favorites are invalid");
      }
      storedData = {
        dailyState,
        history,
        favorites,
        feedback: feedbackRows.map(parseFeedbackRow),
      };
    } catch (error) {
      throw new DesktopStorageUnavailableError(error);
    }
    let pilotState: PilotState | undefined;
    if (pilotRows[0]?.value) {
      try {
        pilotState = normalizePilotState(
          JSON.parse(pilotRows[0].value) as unknown,
          todayLocalDate(),
        );
      } catch {
        pilotState = undefined;
      }
      if (!pilotState) {
        await this.clearPilotState();
      }
    }
    return {
      settings,
      ...storedData,
      pilotState,
    };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const existing = await this.db.select<ValueRow[]>(
      "SELECT value FROM app_kv WHERE key = $1 LIMIT 1",
      ["settings"],
    );
    if (existing.length > 0) {
      try {
        const rawSettings = existing[0]?.value;
        if (typeof rawSettings !== "string") throw new Error("Stored settings are missing");
        parseStoredSettings(rawSettings);
      } catch (error) {
        throw new DesktopStorageUnavailableError(error);
      }
    }
    await this.db.execute(
      `INSERT INTO app_kv (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ["settings", JSON.stringify(settings)],
    );
  }

  async saveDailyState(state: DailyState): Promise<void> {
    await this.db.execute(
      `INSERT INTO daily_state
       (local_date, state, work_id, shown_at, content_version, rule_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(local_date) DO UPDATE SET
         state = excluded.state,
         work_id = excluded.work_id,
         shown_at = excluded.shown_at,
         content_version = excluded.content_version,
         rule_version = excluded.rule_version`,
      [
        state.localDate,
        state.state,
        state.workId ?? null,
        state.shownAt ?? null,
        state.contentVersion,
        state.ruleVersion,
      ],
    );
  }

  async recordDisplay(item: RecommendationHistoryItem): Promise<void> {
    await this.db.execute(
      `INSERT INTO recommendation_display_events
       (local_date, work_id, author, primary_context, displayed_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        item.localDate,
        item.workId,
        item.author,
        item.primaryContext,
        item.displayedAt ?? null,
      ],
    );
    await this.db.execute(
      `DELETE FROM recommendation_display_events WHERE id NOT IN
       (SELECT id FROM recommendation_display_events ORDER BY id DESC LIMIT 60)`,
    );
  }

  async toggleFavorite(workId: string, active: boolean): Promise<void> {
    if (active) {
      await this.db.execute(
        "INSERT OR IGNORE INTO favorites (work_id, created_at) VALUES ($1, $2)",
        [workId, new Date().toISOString()],
      );
    } else {
      await this.db.execute("DELETE FROM favorites WHERE work_id = $1", [
        workId,
      ]);
    }
  }

  async recordFeedback(item: FeedbackItem): Promise<void> {
    await this.db.execute(
      `INSERT INTO feedback (work_id, type, context_tags, created_at, local_date)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        item.workId,
        item.type,
        JSON.stringify(item.contextTags),
        item.createdAt,
        item.localDate ?? null,
      ],
    );
  }

  async removeFeedback(item: FeedbackItem): Promise<void> {
    await this.db.execute(
      `DELETE FROM feedback WHERE id = (
         SELECT id FROM feedback
         WHERE work_id = $1 AND type = $2 AND created_at = $3
         ORDER BY id DESC LIMIT 1
       )`,
      [item.workId, item.type, item.createdAt],
    );
  }

  async savePilotState(state: PilotState): Promise<void> {
    await this.db.execute(
      `INSERT INTO app_kv (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ["pilotState", JSON.stringify(state)],
    );
  }

  async clearPilotState(): Promise<void> {
    await this.db.execute("DELETE FROM app_kv WHERE key = $1", [
      "pilotState",
    ]);
  }

  async clearUserData(): Promise<void> {
    await this.db.execute("INSERT INTO user_data_reset (id) VALUES (1)");
  }
}

export async function createRepository(): Promise<AppRepository> {
  const tauriAvailable =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (tauriAvailable) {
    try {
      return await SqliteRepository.create();
    } catch (error) {
      throw new DesktopStorageUnavailableError(error);
    }
  }
  return new BrowserRepository();
}
