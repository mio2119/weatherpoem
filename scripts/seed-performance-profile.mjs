import { mkdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const APP_IDENTIFIER = "cn.weatherpoem.desktop";

export function resolvePerformanceDatabasePath(profilePath) {
  const tempRoot = realpathSync(os.tmpdir());
  const resolvedProfile = path.resolve(profilePath);
  const relative = path.relative(tempRoot, resolvedProfile);
  const topDirectory = relative.split(path.sep)[0];
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !topDirectory.startsWith("WeatherPoem.Performance.")
  ) {
    throw new Error("性能预置目录必须位于受控系统临时目录");
  }
  return path.join(
    resolvedProfile,
    "appdata",
    APP_IDENTIFIER,
    "weatherpoem.db",
  );
}

export function seedPerformanceProfile(profilePath) {
  const databasePath = resolvePerformanceDatabasePath(profilePath);
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(
      "CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
    );
    const settings = {
      configured: true,
      cityId: "beijing",
      autostart: false,
      anonymousMetrics: false,
      theme: "system",
      reduceMotion: false,
    };
    database
      .prepare(
        `INSERT INTO app_kv (key, value) VALUES ('settings', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(JSON.stringify(settings));
  } finally {
    database.close();
  }
  return databasePath;
}

export function readPerformanceSettings(profilePath) {
  const databasePath = resolvePerformanceDatabasePath(profilePath);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database
      .prepare("SELECT value FROM app_kv WHERE key = 'settings'")
      .get();
    return row?.value ? JSON.parse(row.value) : null;
  } finally {
    database.close();
  }
}

export function inspectPerformanceDatabase(profilePath) {
  const databasePath = resolvePerformanceDatabasePath(profilePath);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    const row = database
      .prepare("SELECT value FROM app_kv WHERE key = 'settings'")
      .get();
    return {
      databasePath,
      tables,
      settings: row?.value ? JSON.parse(row.value) : null,
    };
  } finally {
    database.close();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const inspectOnly = process.argv[2] === "--inspect";
  const profilePath = process.argv[inspectOnly ? 3 : 2];
  if (!profilePath) throw new Error("缺少性能预置目录");
  if (inspectOnly) {
    console.log(JSON.stringify(inspectPerformanceDatabase(profilePath)));
  } else {
    const databasePath = seedPerformanceProfile(profilePath);
    console.log(`已预置隔离性能配置：${databasePath}`);
  }
}
