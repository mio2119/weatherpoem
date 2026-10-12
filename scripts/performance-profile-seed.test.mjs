import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
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
