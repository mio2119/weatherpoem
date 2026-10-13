import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepository, DesktopStorageUnavailableError } from "./persistence";

const sqlite = vi.hoisted(() => ({
  database: null as DatabaseSync | null,
  loads: 0,
  failLoad: false,
}));

function indexedBindings(values: Array<string | number | null>): Record<string, string | number | null> {
  return Object.fromEntries(values.map((value, index) => [String(index + 1), value]));
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
    sqlite.database.exec(`
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
});
