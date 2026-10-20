import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const projectRoot = path.resolve(import.meta.dirname, "..");
const candidateArgument = process.argv[2];
assert(
  process.argv.length === 3 &&
    /^--candidate=(?!target$)[a-z0-9][a-z0-9-]{0,39}$/.test(candidateArgument),
  "仅支持 --candidate=具名内部候选；不得使用旧 target 候选",
);
const name = candidateArgument.slice("--candidate=".length);
const artifactPath = `.work/redesign-${name}/release/weatherpoem.exe`;
const executablePath = path.join(projectRoot, ...artifactPath.split("/"));
const reportPath = path.join(
  projectRoot,
  "review",
  "redesign",
  "evidence",
  `T01_SQLITE_MIGRATION_${name}.json`,
);
const appVersion = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
).version;
const LEGACY_WORK_ID = "li-bai-du-zuo-jing-ting-shan";
const LEGACY_DATE = "2025-01-01";
const LEGACY_TIMESTAMP = "2025-01-01T08:00:00.000+08:00";

function ensureNoExistingProduct() {
  const result = spawnSync(
    "tasklist.exe",
    ["/FI", "IMAGENAME eq weatherpoem.exe", "/FO", "CSV", "/NH"],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(result.status, 0, "无法核验 WeatherPoem 是否已在运行");
  assert(
    !/"weatherpoem\.exe"/i.test(result.stdout),
    "WeatherPoem 已在运行；不得与用户进程并行做迁移测试",
  );
}

function seedLegacyDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      CREATE TABLE app_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE daily_state (
        local_date TEXT PRIMARY KEY NOT NULL,
        state TEXT NOT NULL,
        work_id TEXT,
        shown_at TEXT,
        content_version TEXT NOT NULL,
        rule_version TEXT NOT NULL
      );
      CREATE TABLE recommendation_history (
        local_date TEXT PRIMARY KEY NOT NULL,
        work_id TEXT NOT NULL,
        author TEXT NOT NULL,
        primary_context TEXT NOT NULL
      );
      CREATE TABLE favorites (
        work_id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_id TEXT NOT NULL,
        type TEXT NOT NULL,
        context_tags TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    database.prepare("INSERT INTO app_kv (key, value) VALUES (?, ?)").run(
      "settings",
      JSON.stringify({
        configured: true,
        cityId: "beijing",
        autostart: false,
        anonymousMetrics: false,
        theme: "system",
        reduceMotion: false,
      }),
    );
    database.prepare(
      `INSERT INTO daily_state VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      LEGACY_DATE,
      "shown",
      LEGACY_WORK_ID,
      LEGACY_TIMESTAMP,
      "0.2.0",
      "1.0.0",
    );
    database.prepare(
      `INSERT INTO recommendation_history VALUES (?, ?, ?, ?)`,
    ).run(LEGACY_DATE, LEGACY_WORK_ID, "李白", "season");
    database.prepare("INSERT INTO favorites VALUES (?, ?)").run(
      LEGACY_WORK_ID,
      LEGACY_TIMESTAMP,
    );
    database.prepare(
      `INSERT INTO feedback (work_id, type, context_tags, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(LEGACY_WORK_ID, "disliked", '["autumn"]', LEGACY_TIMESTAMP);
  } finally {
    database.close();
  }
}

function inspectMigration(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const feedbackColumns = database
      .prepare("PRAGMA table_info(feedback)")
      .all()
      .map((column) => column.name);
    const oldHistory = database.prepare(
      "SELECT local_date, work_id FROM recommendation_history WHERE local_date = ?",
    ).get(LEGACY_DATE);
    const migratedEvents = database.prepare(
      `SELECT local_date, work_id, displayed_at
       FROM recommendation_display_events
       WHERE local_date = ? AND work_id = ? AND displayed_at IS NULL`,
    ).all(LEGACY_DATE, LEGACY_WORK_ID);
    const currentEvents = database.prepare(
      `SELECT COUNT(*) AS count FROM recommendation_display_events
       WHERE displayed_at IS NOT NULL`,
    ).get().count;
    const favorite = database.prepare(
      "SELECT work_id FROM favorites WHERE work_id = ?",
    ).get(LEGACY_WORK_ID);
    const feedback = database.prepare(
      "SELECT work_id, type, context_tags, created_at, local_date FROM feedback WHERE id = 1",
    ).get();
    const settings = JSON.parse(database.prepare(
      "SELECT value FROM app_kv WHERE key = 'settings'",
    ).get().value);
    const oldDailyState = database.prepare(
      "SELECT state, work_id FROM daily_state WHERE local_date = ?",
    ).get(LEGACY_DATE);

    assert(feedbackColumns.includes("local_date"), "旧反馈表未增加 local_date 列");
    assert.equal(oldHistory?.work_id, LEGACY_WORK_ID, "旧每日历史丢失");
    assert.equal(migratedEvents.length, 1, "旧历史迁移缺失或重复");
    assert.equal(migratedEvents[0].work_id, LEGACY_WORK_ID);
    assert(currentEvents >= 1, "新版未写入当前展示事件");
    assert.equal(favorite?.work_id, LEGACY_WORK_ID, "旧收藏丢失");
    assert.equal(feedback?.work_id, LEGACY_WORK_ID, "旧反馈丢失");
    assert.equal(feedback?.type, "disliked");
    assert.equal(feedback?.created_at, LEGACY_TIMESTAMP);
    assert.equal(feedback?.local_date, null, "旧反馈日期不应被伪造");
    assert.equal(settings.cityId, "beijing", "旧城市设置丢失");
    assert.equal(settings.configured, true, "旧配置状态丢失");
    assert.equal(oldDailyState?.work_id, LEGACY_WORK_ID, "旧每日状态丢失");
    return {
      legacyHistoryRows: 1,
      migratedLegacyEventRows: migratedEvents.length,
      currentDisplayEventRows: currentEvents,
      oldFavoritePreserved: true,
      oldFeedbackPreserved: true,
      oldSettingsPreserved: true,
      oldDailyStatePreserved: true,
      feedbackLocalDateColumnAdded: true,
    };
  } finally {
    database.close();
  }
}

async function waitForReady(markerPath, child, runId) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`应用在完成旧库迁移前退出：${child.exitCode}`);
    }
    try {
      const marker = JSON.parse(await readFile(markerPath, "utf8"));
      assert.equal(marker.schemaVersion, "1.2");
      assert.equal(marker.runId, runId);
      assert.equal(marker.processId, child.pid);
      assert.equal(marker.appVersion, appVersion);
      assert.equal(marker.performanceScenario, "weather-offline");
      assert.equal(marker.readyView, "poem");
      assert.equal(marker.readyMode, "offline-rules");
      return marker;
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error("15 秒内未取得旧库升级后的有效诗笺就绪记录");
}

async function launchAndObserve(root, profilePath, index) {
  const markerDirectory = path.join(root, `probe-${index}`);
  await mkdir(markerDirectory);
  const markerPath = path.join(
    markerDirectory,
    "weatherpoem-performance-ready.json",
  );
  const runId = randomUUID();
  const child = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    env: {
      ...process.env,
      APPDATA: path.join(profilePath, "appdata"),
      LOCALAPPDATA: path.join(profilePath, "localappdata"),
      WEATHERPOEM_PERFORMANCE_PROFILE: profilePath,
      WEATHERPOEM_PERFORMANCE_PROBE: markerPath,
      WEATHERPOEM_PERFORMANCE_RUN_ID: runId,
      WEATHERPOEM_PERFORMANCE_SCENARIO: "weather-offline",
    },
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    return await waitForReady(markerPath, child, runId);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      let timeout;
      try {
        await Promise.race([
          exited,
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("隔离迁移测试进程未能结束")),
              5_000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}

function assertSafeTemporaryRoot(root) {
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root));
  assert(
    relative.startsWith("WeatherPoem.Performance.Migration.") &&
      !relative.includes(path.sep) &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative),
    "拒绝清理非迁移测试专用临时目录",
  );
}

async function removeSafeTemporaryRoot(root) {
  assertSafeTemporaryRoot(root);
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
}

ensureNoExistingProduct();
await stat(executablePath);
const executableSha256 = createHash("sha256")
  .update(await readFile(executablePath))
  .digest("hex")
  .toUpperCase();
const runRoot = await mkdtemp(path.join(
  os.tmpdir(),
  "WeatherPoem.Performance.Migration.",
));
assertSafeTemporaryRoot(runRoot);
let completed = false;
try {
  const profilePath = path.join(runRoot, "profile");
  const appData = path.join(profilePath, "appdata");
  const localAppData = path.join(profilePath, "localappdata");
  const databasePath = path.join(
    appData,
    "cn.weatherpoem.desktop",
    "weatherpoem.db",
  );
  await Promise.all([
    mkdir(path.dirname(databasePath), { recursive: true }),
    mkdir(localAppData, { recursive: true }),
  ]);
  seedLegacyDatabase(databasePath);

  const firstReady = await launchAndObserve(runRoot, profilePath, 1);
  const first = inspectMigration(databasePath);
  const secondReady = await launchAndObserve(runRoot, profilePath, 2);
  const second = inspectMigration(databasePath);
  assert.equal(second.migratedLegacyEventRows, 1);
  assert(second.currentDisplayEventRows > first.currentDisplayEventRows);

  const report = {
    schemaVersion: "1.0",
    testKind: "isolated-legacy-sqlite-migration",
    appVersion,
    generatedAt: new Date().toISOString(),
    artifact: { path: artifactPath, sha256: executableSha256 },
    scenario: {
      legacyDate: LEGACY_DATE,
      legacyWorkId: LEGACY_WORK_ID,
      launches: 2,
      profileIsolated: true,
      realUserDataTouched: false,
      simulatedWeather: "weather-offline",
    },
    firstLaunch: {
      readyView: firstReady.readyView,
      readyMode: firstReady.readyMode,
      ...first,
    },
    secondLaunch: {
      readyView: secondReady.readyView,
      readyMode: secondReady.readyMode,
      ...second,
    },
    result: "passed",
    limitations: {
      actualUserDatabaseNotRead: true,
      hibernationAndMidnightNotMeasured: true,
      browserStorageMigrationNotMeasured: true,
    },
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  completed = true;
  console.log(`隔离旧 SQLite 升级通过：${reportPath}`);
} finally {
  if (completed) {
    await removeSafeTemporaryRoot(runRoot);
  } else {
    console.error(`迁移测试失败，隔离资料保留供诊断：${runRoot}`);
  }
}
