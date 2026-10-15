import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepository, DEFAULT_SETTINGS, DesktopStorageUnavailableError } from "./persistence";

const sqlite = vi.hoisted(() => ({
  database: null as DatabaseSync | null,
  loads: 0,
  failLoad: false,
}));

function indexedBindings(values: Array<string | number | null>): Record<string, string | number | null> {
  return Object.fromEntries(values.map((value, index) => [String(index + 1), value]));
}

const USER_DATA_TABLES = [
  "app_kv", "daily_state", "recommendation_history",
  "recommendation_display_events", "favorites", "feedback",
] as const;

function userRowCounts(database: DatabaseSync): number[] {
  return USER_DATA_TABLES.map((table) =>
    (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count,
  );
}

function seedLegacyDatabase(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id TEXT NOT NULL,
      type TEXT NOT NULL,
      context_tags TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE favorites (
      work_id TEXT PRIMARY KEY NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO feedback (work_id, type, context_tags, created_at)
    VALUES ('legacy-poem', 'disliked', '["winter"]', '2025-01-01T00:00:00Z');
    INSERT INTO favorites (work_id, created_at)
    VALUES ('legacy-poem', '2025-01-01T00:00:00Z');
  `);
}

function seedResetRows(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO app_kv (key, value) VALUES ('settings', '{"configured":true}');
    INSERT INTO daily_state
      (local_date, state, work_id, shown_at, content_version, rule_version)
      VALUES ('2026-10-13', 'shown', 'legacy-poem', NULL, 'test', 'test');
    INSERT INTO recommendation_history
      (local_date, work_id, author, primary_context)
      VALUES ('2026-10-13', 'legacy-poem', 'author', 'calendar');
    INSERT INTO recommendation_display_events
      (local_date, work_id, author, primary_context, displayed_at)
      VALUES ('2026-10-13', 'legacy-poem', 'author', 'calendar', NULL);
  `);
}

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: async (url: string) => {
      expect(url).toBe("sqlite:isolated-test");
      if (sqlite.failLoad) throw new Error("database locked");
      const database = sqlite.database;
      if (!database) throw new Error("SQLite test database is not ready");
      sqlite.loads += 1;
      return {
        execute: async (query: string, bindValues: Array<string | number | null> = []) => {
          const statement = database.prepare(query);
          const result = bindValues.length
            ? statement.run(indexedBindings(bindValues))
            : statement.run();
          return { rowsAffected: result.changes };
        },
        select: async (query: string, bindValues: Array<string | number | null> = []) => {
          const statement = database.prepare(query);
          return bindValues.length
            ? statement.all(indexedBindings(bindValues))
            : statement.all();
        },
      };
    },
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string) => {
    expect(command).toBe("database_url");
    return "sqlite:isolated-test";
  },
}));

describe("SQLite feedback migration and undo", () => {
  beforeEach(() => {
    localStorage.clear();
    window.__TAURI_INTERNALS__ = {};
    sqlite.database = new DatabaseSync(":memory:");
    sqlite.loads = 0;
    sqlite.failLoad = false;
    seedLegacyDatabase(sqlite.database);
  });

  afterEach(() => {
    sqlite.database?.close();
    sqlite.database = null;
    delete window.__TAURI_INTERNALS__;
    localStorage.clear();
  });

  it("removes only the latest matching dislike and preserves migrated data after reload", async () => {
    const database = sqlite.database!;
    const repository = await createRepository();
    expect(sqlite.loads).toBe(1);
    expect(database.prepare("PRAGMA table_info(feedback)").all()
      .map((column) => column.name)).toContain("local_date");

    const older = {
      workId: "rain-poem",
      type: "disliked" as const,
      contextTags: ["rain"],
      createdAt: "2026-10-13T08:00:00Z",
      localDate: "2026-10-13",
    };
    const latest = { ...older, createdAt: "2026-10-13T09:00:00Z" };
    const replacement = { ...older, type: "replaced" as const };
    await repository.recordFeedback(older);
    await repository.recordFeedback(latest);
    await repository.recordFeedback(replacement);
    await repository.removeFeedback(latest);

    const rows = database.prepare(
      "SELECT work_id, type, created_at, local_date FROM feedback ORDER BY id",
    ).all();
    expect(rows).toEqual([
      {
        work_id: "legacy-poem", type: "disliked",
        created_at: "2025-01-01T00:00:00Z", local_date: null,
      },
      {
        work_id: older.workId, type: older.type,
        created_at: older.createdAt, local_date: older.localDate,
      },
      {
        work_id: replacement.workId, type: replacement.type,
        created_at: replacement.createdAt, local_date: replacement.localDate,
      },
    ]);

    const reloaded = await (await createRepository()).load();
    expect(sqlite.loads).toBe(2);
    expect(reloaded.feedback).toHaveLength(3);
    expect(reloaded.feedback.map((item) => item.type)).toEqual([
      "replaced", "disliked", "disliked",
    ]);
    expect(reloaded.favorites).toEqual(["legacy-poem"]);
    expect(localStorage.length).toBe(0);
  });

  it("does not silently switch to empty browser storage when desktop SQLite cannot open", async () => {
    sqlite.failLoad = true;
    localStorage.setItem("weatherpoem.local.v1", "browser-data-untouched");

    await expect(createRepository()).rejects.toMatchObject({
      name: "DesktopStorageUnavailableError",
      message: expect.stringContaining("已停止载入"),
    });
    await expect(createRepository()).rejects.toBeInstanceOf(
      DesktopStorageUnavailableError,
    );
    expect(localStorage.getItem("weatherpoem.local.v1"))
      .toBe("browser-data-untouched");

    sqlite.failLoad = false;
    const recovered = await (await createRepository()).load();
    expect(recovered.favorites).toEqual(["legacy-poem"]);
    expect(recovered.feedback[0]?.workId).toBe("legacy-poem");
    expect(localStorage.getItem("weatherpoem.local.v1"))
      .toBe("browser-data-untouched");
  });

  it.each([
    '{"configured":true,"cityId":',
    '{"configured":true}',
    '{"configured":true,"cityId":null}',
  ])("keeps a damaged SQLite settings row intact on load and save: %s", async (raw) => {
    const database = sqlite.database!;
    const repository = await createRepository();
    database.prepare("INSERT INTO app_kv (key, value) VALUES ('settings', ?)").run(raw);
    const readRaw = () => (database.prepare(
      "SELECT value FROM app_kv WHERE key = 'settings'",
    ).get() as { value: string }).value;

    await expect(repository.load()).rejects.toBeInstanceOf(DesktopStorageUnavailableError);
    await expect(repository.saveSettings({
      ...DEFAULT_SETTINGS, configured: true, cityId: "beijing",
    })).rejects.toBeInstanceOf(DesktopStorageUnavailableError);
    expect(readRaw()).toBe(raw);
    await expect((await createRepository()).load())
      .rejects.toBeInstanceOf(DesktopStorageUnavailableError);
    expect(readRaw()).toBe(raw);
    expect((database.prepare("SELECT work_id FROM favorites").all() as Array<{ work_id: string }>))
      .toEqual([{ work_id: "legacy-poem" }]);
  });

  it("loads old SQLite settings missing only newer preferences and keeps the chosen city", async () => {
    const database = sqlite.database!;
    const repository = await createRepository();
    database.prepare("INSERT INTO app_kv (key, value) VALUES ('settings', ?)")
      .run(JSON.stringify({
        configured: true, cityId: "hangzhou", autostart: false,
        anonymousMetrics: false, theme: "dark", reduceMotion: true,
      }));
    const loaded = await repository.load();
    expect(loaded.settings).toMatchObject({
      configured: true, cityId: "hangzhou", autostart: false,
      theme: "dark", reduceMotion: true,
      poemLayout: "horizontal", poemFontSize: "medium",
    });
    expect(loaded.favorites).toEqual(["legacy-poem"]);
    await repository.saveSettings({ ...loaded.settings, poemLayout: "vertical" });
    const reloaded = await (await createRepository()).load();
    expect(reloaded.settings.cityId).toBe("hangzhou");
    expect(reloaded.settings.poemLayout).toBe("vertical");
    expect(reloaded.favorites).toEqual(["legacy-poem"]);
  });

  it("preserves a damaged settings row across a file close and reopen until repaired", async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "weatherpoem-sqlite-settings-"));
    const databasePath = join(temporaryDirectory, "settings.db");
    const damaged = '{"configured":true,"cityId":';
    try {
      sqlite.database?.close();
      sqlite.database = new DatabaseSync(databasePath);
      seedLegacyDatabase(sqlite.database);
      const repository = await createRepository();
      sqlite.database.prepare("INSERT INTO app_kv (key, value) VALUES ('settings', ?)").run(damaged);
      await expect(repository.load()).rejects.toBeInstanceOf(DesktopStorageUnavailableError);
      await expect(repository.saveSettings({ ...DEFAULT_SETTINGS, configured: true }))
        .rejects.toBeInstanceOf(DesktopStorageUnavailableError);

      sqlite.database.close();
      sqlite.database = new DatabaseSync(databasePath);
      const readRaw = () => (sqlite.database!.prepare(
        "SELECT value FROM app_kv WHERE key = 'settings'",
      ).get() as { value: string }).value;
      expect(readRaw()).toBe(damaged);
      expect((sqlite.database.prepare("SELECT work_id FROM favorites").all() as Array<{ work_id: string }>))
        .toEqual([{ work_id: "legacy-poem" }]);

      sqlite.database.prepare("UPDATE app_kv SET value = ? WHERE key = 'settings'")
        .run(JSON.stringify({ configured: true, cityId: "hangzhou" }));
      const recovered = await (await createRepository()).load();
      expect(recovered.settings.cityId).toBe("hangzhou");
      expect(recovered.favorites).toEqual(["legacy-poem"]);
    } finally {
      sqlite.database?.close();
      sqlite.database = null;
      const resolvedTempBase = realpathSync(tmpdir()).toLowerCase();
      const resolvedDirectory = realpathSync(temporaryDirectory);
      if (
        !resolvedDirectory.toLowerCase().startsWith(`${resolvedTempBase}${sep}`) ||
        !basename(resolvedDirectory).startsWith("weatherpoem-sqlite-settings-")
      ) {
        throw new Error("Refusing to remove an unexpected SQLite test directory");
      }
      rmSync(resolvedDirectory, { recursive: true });
    }
  });

  it.each([
    { contextTags: "not-json", type: "disliked" },
    { contextTags: '["winter", 7]', type: "disliked" },
    { contextTags: '["winter"]', type: "other" },
  ])("stops on damaged SQLite feedback without losing the raw row: %j", async (fixture) => {
    const database = sqlite.database!;
    const repository = await createRepository();
    database.prepare(
      "UPDATE feedback SET context_tags = ?, type = ? WHERE work_id = 'legacy-poem'",
    ).run(fixture.contextTags, fixture.type);
    const rawRow = () => database.prepare(
      "SELECT context_tags, type FROM feedback WHERE work_id = 'legacy-poem'",
    ).get() as { context_tags: string; type: string };

    await expect(repository.load()).rejects.toBeInstanceOf(DesktopStorageUnavailableError);
    expect(rawRow()).toEqual({ context_tags: fixture.contextTags, type: fixture.type });

    database.prepare(
      "UPDATE feedback SET context_tags = ?, type = ? WHERE work_id = 'legacy-poem'",
    ).run('["winter"]', "disliked");
    const recovered = await repository.load();
    expect(recovered.feedback[0]?.contextTags).toEqual(["winter"]);
    expect(recovered.favorites).toEqual(["legacy-poem"]);
  });

  it("keeps damaged feedback on disk across a failed load and restart", async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "weatherpoem-sqlite-feedback-"));
    const databasePath = join(temporaryDirectory, "feedback.db");
    try {
      sqlite.database?.close();
      sqlite.database = new DatabaseSync(databasePath);
      seedLegacyDatabase(sqlite.database);
      const repository = await createRepository();
      const damaged = '["winter", 7]';
      sqlite.database.prepare("UPDATE feedback SET context_tags = ? WHERE work_id = 'legacy-poem'")
        .run(damaged);
      await expect(repository.load()).rejects.toBeInstanceOf(DesktopStorageUnavailableError);

      sqlite.database.close();
      sqlite.database = new DatabaseSync(databasePath);
      const readRaw = () => (sqlite.database!.prepare(
        "SELECT context_tags FROM feedback WHERE work_id = 'legacy-poem'",
      ).get() as { context_tags: string }).context_tags;
      expect(readRaw()).toBe(damaged);
      expect((sqlite.database.prepare("SELECT work_id FROM favorites").all() as Array<{ work_id: string }>))
        .toEqual([{ work_id: "legacy-poem" }]);

      const reopened = await createRepository();
      await expect(reopened.load()).rejects.toBeInstanceOf(DesktopStorageUnavailableError);
      expect(readRaw()).toBe(damaged);
      sqlite.database.prepare("UPDATE feedback SET context_tags = ? WHERE work_id = 'legacy-poem'")
        .run('["winter"]');
      const recovered = await reopened.load();
      expect(recovered.feedback[0]?.contextTags).toEqual(["winter"]);
      expect(recovered.favorites).toEqual(["legacy-poem"]);
    } finally {
      sqlite.database?.close();
      sqlite.database = null;
      const resolvedTempBase = realpathSync(tmpdir()).toLowerCase();
      const resolvedDirectory = realpathSync(temporaryDirectory);
      if (
        !resolvedDirectory.toLowerCase().startsWith(`${resolvedTempBase}${sep}`) ||
        !basename(resolvedDirectory).startsWith("weatherpoem-sqlite-feedback-")
      ) {
        throw new Error("Refusing to remove an unexpected SQLite test directory");
      }
      rmSync(resolvedDirectory, { recursive: true });
    }
  });

  it("does not accept an unknown SQLite daily state", async () => {
    const database = sqlite.database!;
    const repository = await createRepository();
    database.prepare(
      `INSERT INTO daily_state
       (local_date, state, work_id, shown_at, content_version, rule_version)
       VALUES ('2026-10-15', 'surprise', 'legacy-poem', NULL, 'test', 'test')`,
    ).run();
    const readState = () => (database.prepare(
      "SELECT state FROM daily_state WHERE local_date = '2026-10-15'",
    ).get() as { state: string }).state;

    await expect(repository.load()).rejects.toBeInstanceOf(DesktopStorageUnavailableError);
    expect(readState()).toBe("surprise");
    database.prepare("UPDATE daily_state SET state = 'shown' WHERE local_date = '2026-10-15'").run();
    expect((await repository.load()).dailyState?.state).toBe("shown");
  });

  it("does not accept an empty SQLite display-history work ID", async () => {
    const database = sqlite.database!;
    const repository = await createRepository();
    database.prepare(
      `INSERT INTO recommendation_display_events
       (local_date, work_id, author, primary_context, displayed_at)
       VALUES ('2026-10-15', '', 'author', 'calendar', NULL)`,
    ).run();
    const readWorkId = () => (database.prepare(
      "SELECT work_id FROM recommendation_display_events WHERE local_date = '2026-10-15'",
    ).get() as { work_id: string }).work_id;

    await expect(repository.load()).rejects.toBeInstanceOf(DesktopStorageUnavailableError);
    expect(readWorkId()).toBe("");
    database.prepare(
      "UPDATE recommendation_display_events SET work_id = 'legacy-poem' WHERE local_date = '2026-10-15'",
    ).run();
    expect((await repository.load()).history[0]?.workId).toBe("legacy-poem");
  });

  it("does not accept an empty SQLite favorite work ID", async () => {
    const database = sqlite.database!;
    const repository = await createRepository();
    database.prepare("UPDATE favorites SET work_id = '' WHERE work_id = 'legacy-poem'").run();
    const readWorkId = () => (database.prepare(
      "SELECT work_id FROM favorites LIMIT 1",
    ).get() as { work_id: string }).work_id;

    await expect(repository.load()).rejects.toBeInstanceOf(DesktopStorageUnavailableError);
    expect(readWorkId()).toBe("");
    database.prepare("UPDATE favorites SET work_id = 'legacy-poem' WHERE work_id = ''").run();
    expect((await repository.load()).favorites).toEqual(["legacy-poem"]);
  });

  it("rolls back every user table when a deletion fails midway, then clears all on retry", async () => {
    const database = sqlite.database!;
    const repository = await createRepository();
    seedResetRows(database);
    database.exec(`CREATE TRIGGER fail_reset BEFORE DELETE ON favorites
      BEGIN SELECT RAISE(ABORT, 'simulated deletion failure'); END`);
    const before = userRowCounts(database);
    expect(before.every((count) => count > 0)).toBe(true);

    await expect(repository.clearUserData())
      .rejects.toThrow("simulated deletion failure");
    expect(userRowCounts(database)).toEqual(before);

    database.exec("DROP TRIGGER fail_reset");
    await repository.clearUserData();
    expect(userRowCounts(database)).toEqual(USER_DATA_TABLES.map(() => 0));
    expect((database.prepare("SELECT COUNT(*) AS count FROM user_data_reset").get() as { count: number }).count)
      .toBe(0);
    const reopened = await createRepository();
    await reopened.clearUserData();
    expect(userRowCounts(database)).toEqual(USER_DATA_TABLES.map(() => 0));
  });

  it("keeps a failed reset intact on disk across a close and reopen", async () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "weatherpoem-sqlite-reset-"));
    const databasePath = join(temporaryDirectory, "reset.db");
    try {
      sqlite.database?.close();
      sqlite.database = new DatabaseSync(databasePath);
      seedLegacyDatabase(sqlite.database);
      const repository = await createRepository();
      seedResetRows(sqlite.database);
      sqlite.database.exec(`CREATE TRIGGER fail_reset BEFORE DELETE ON favorites
        BEGIN SELECT RAISE(ABORT, 'simulated deletion failure'); END`);
      const before = userRowCounts(sqlite.database);

      await expect(repository.clearUserData())
        .rejects.toThrow("simulated deletion failure");
      sqlite.database.close();
      sqlite.database = new DatabaseSync(databasePath);
      expect(userRowCounts(sqlite.database)).toEqual(before);

      sqlite.database.exec("DROP TRIGGER fail_reset");
      const reopened = await createRepository();
      await reopened.clearUserData();
      sqlite.database.close();
      sqlite.database = new DatabaseSync(databasePath);
      expect(userRowCounts(sqlite.database)).toEqual(USER_DATA_TABLES.map(() => 0));
      expect((sqlite.database.prepare("SELECT COUNT(*) AS count FROM user_data_reset").get() as { count: number }).count)
        .toBe(0);
    } finally {
      sqlite.database?.close();
      sqlite.database = null;
      const resolvedTempBase = realpathSync(tmpdir()).toLowerCase();
      const resolvedDirectory = realpathSync(temporaryDirectory);
      if (
        !resolvedDirectory.toLowerCase().startsWith(`${resolvedTempBase}${sep}`) ||
        !basename(resolvedDirectory).startsWith("weatherpoem-sqlite-reset-")
      ) {
        throw new Error("Refusing to remove an unexpected SQLite test directory");
      }
      rmSync(resolvedDirectory, { recursive: true });
    }
  });
});
