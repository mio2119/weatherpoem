import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  inspectPerformanceDatabase,
  resolvePerformanceDatabasePath,
  seedPerformanceProfile,
} from "./seed-performance-profile.mjs";

test("只在系统临时目录预置已配置且无统计授权的性能账户", async () => {
  const profile = await mkdtemp(
    path.join(os.tmpdir(), "WeatherPoem.Performance.Test."),
  );
  try {
    const databasePath = seedPerformanceProfile(profile);
    const database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database
      .prepare("SELECT value FROM app_kv WHERE key = 'settings'")
      .get();
    database.close();

    const settings = JSON.parse(row.value);
    assert.equal(settings.configured, true);
    assert.equal(settings.cityId, "beijing");
    assert.equal(settings.autostart, false);
    assert.equal(settings.anonymousMetrics, false);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

test("拒绝把真实用户目录当作性能预置目录", () => {
  assert.throws(
    () =>
      resolvePerformanceDatabasePath(
        path.join(os.homedir(), "AppData", "Roaming"),
      ),
    /受控系统临时目录/,
  );
});

test("隔离静态场景可以预置减少动态偏好", async () => {
  const profile = await mkdtemp(
    path.join(os.tmpdir(), "WeatherPoem.Performance.Motion."),
  );
  try {
    const databasePath = seedPerformanceProfile(profile, { reduceMotion: true });
    const database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database.prepare("SELECT value FROM app_kv WHERE key = 'settings'").get();
    database.close();
    assert.equal(JSON.parse(row.value).reduceMotion, true);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

test("隔离资料检查返回当前日键与作品，便于静动同诗境核对", async () => {
  const profile = await mkdtemp(
    path.join(os.tmpdir(), "WeatherPoem.Performance.Motion."),
  );
  try {
    const databasePath = seedPerformanceProfile(profile);
    const database = new DatabaseSync(databasePath);
    database.exec(
      "CREATE TABLE daily_state (local_date TEXT PRIMARY KEY, state TEXT, work_id TEXT)",
    );
    database
      .prepare("INSERT INTO daily_state VALUES (?, ?, ?)")
      .run("2026-10-13", "shown", "rain-poem");
    database.close();
    assert.deepEqual(inspectPerformanceDatabase(profile).dailyState, {
      local_date: "2026-10-13",
      state: "shown",
      work_id: "rain-poem",
    });
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});
