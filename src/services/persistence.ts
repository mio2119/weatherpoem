import type {
  AppBootstrap,
  AppSettings,
  DailyState,
  FeedbackItem,
  PilotState,
  RecommendationHistoryItem,
} from "../types";
import { normalizePilotState } from "../core/pilot";

export const DEFAULT_SETTINGS: AppSettings = {
  configured: false,
  cityId: "beijing",
  autostart: true,
  anonymousMetrics: false,
  theme: "system",
  reduceMotion: false,
};

export interface AppRepository {
  load(): Promise<AppBootstrap>;
  saveSettings(settings: AppSettings): Promise<void>;
  saveDailyState(state: DailyState): Promise<void>;
  recordDisplay(item: RecommendationHistoryItem): Promise<void>;
  toggleFavorite(workId: string, active: boolean): Promise<void>;
  recordFeedback(item: FeedbackItem): Promise<void>;
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
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyData(): BrowserData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    history: [],
    favorites: [],
    feedback: [],
  };
}

function parseBrowserData(raw: string | null): BrowserData {
  if (!raw) return emptyData();
  try {
    const parsed = JSON.parse(raw) as Partial<BrowserData>;
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      dailyState: parsed.dailyState,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    };
  } catch {
    return emptyData();
  }
}

class BrowserRepository implements AppRepository {
  private read(): BrowserData {
    if (typeof localStorage === "undefined") return emptyData();
    return parseBrowserData(localStorage.getItem(STORAGE_KEY));
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
    data.history = [
      item,
      ...data.history.filter((entry) => entry.localDate !== item.localDate),
    ].slice(0, 60);
    this.write(data);
  }

  async toggleFavorite(workId: string, active: boolean): Promise<void> {
    const data = this.read();
    const favorites = new Set(data.favorites);
    if (active) favorites.add(workId);
    else favorites.delete(workId);
    data.favorites = [...favorites];
    this.write(data);
  }

  async recordFeedback(item: FeedbackItem): Promise<void> {
    const data = this.read();
    data.feedback = [item, ...data.feedback].slice(0, 100);
    this.write(data);
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
}

interface FavoriteRow {
  work_id: string;
}

interface FeedbackRow {
  work_id: string;
  type: FeedbackItem["type"];
  context_tags: string;
  created_at: string;
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
        created_at TEXT NOT NULL
      )`,
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
      "SELECT * FROM recommendation_history ORDER BY local_date DESC LIMIT 60",
    );
    const favoriteRows = await this.db.select<FavoriteRow[]>(
      "SELECT work_id FROM favorites ORDER BY created_at DESC",
    );
    const feedbackRows = await this.db.select<FeedbackRow[]>(
      "SELECT work_id, type, context_tags, created_at FROM feedback ORDER BY id DESC LIMIT 100",
    );

    let settings = { ...DEFAULT_SETTINGS };
    if (settingsRows[0]?.value) {
      try {
        settings = {
          ...settings,
          ...(JSON.parse(settingsRows[0].value) as Partial<AppSettings>),
        };
      } catch {
        // 保留安全默认值；损坏的设置不会阻止应用启动。
      }
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
    const daily = dailyRows[0];
    return {
      settings,
      dailyState: daily
        ? {
            localDate: daily.local_date,
            state: daily.state,
            workId: daily.work_id ?? undefined,
            shownAt: daily.shown_at ?? undefined,
            contentVersion: daily.content_version,
            ruleVersion: daily.rule_version,
          }
        : undefined,
      history: historyRows.map((row) => ({
        localDate: row.local_date,
        workId: row.work_id,
        author: row.author,
        primaryContext: row.primary_context,
      })),
      favorites: favoriteRows.map((row) => row.work_id),
      feedback: feedbackRows.map((row) => ({
        workId: row.work_id,
        type: row.type,
        contextTags: safeStringArray(row.context_tags),
        createdAt: row.created_at,
      })),
      pilotState,
    };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
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
      `INSERT INTO recommendation_history
       (local_date, work_id, author, primary_context)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(local_date) DO UPDATE SET
         work_id = excluded.work_id,
         author = excluded.author,
         primary_context = excluded.primary_context`,
      [item.localDate, item.workId, item.author, item.primaryContext],
    );
    await this.db.execute(
      `DELETE FROM recommendation_history WHERE local_date NOT IN
       (SELECT local_date FROM recommendation_history ORDER BY local_date DESC LIMIT 60)`,
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
      `INSERT INTO feedback (work_id, type, context_tags, created_at)
       VALUES ($1, $2, $3, $4)`,
      [
        item.workId,
        item.type,
        JSON.stringify(item.contextTags),
        item.createdAt,
      ],
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
    await this.db.execute("DELETE FROM app_kv");
    await this.db.execute("DELETE FROM daily_state");
    await this.db.execute("DELETE FROM recommendation_history");
    await this.db.execute("DELETE FROM favorites");
    await this.db.execute("DELETE FROM feedback");
  }
}

function safeStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function createRepository(): Promise<AppRepository> {
  const tauriAvailable =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (tauriAvailable) {
    try {
      return await SqliteRepository.create();
    } catch (error) {
      console.warn("SQLite 初始化失败，使用浏览器本地存储降级。", error);
    }
  }
  return new BrowserRepository();
}
