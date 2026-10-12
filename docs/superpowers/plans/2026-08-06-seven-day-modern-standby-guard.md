# WeatherPoem 七天长测防休眠与快速失败实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为正式七天采样器增加进程级 Windows 防系统睡眠租约、150 秒连续性快速失败和进程消失时的结构化状态，并在不改变冻结候选与既有正式证据的前提下启动一轮新的七天长测。

**Architecture:** `test-performance-long-run.ps1` 仍是唯一采样器，只在 `seven-day` 模式获取 `ES_CONTINUOUS | ES_SYSTEM_REQUIRED`，允许显示器关闭，并在最外层 `finally` 释放；采样循环在追加样本前同时比较累计时间与 UTC 记录时间。Node 状态支持层继续负责证据完整性硬校验，但把 launcher/app 消失降级为可消费的 `failed` JSON。

**Tech Stack:** Windows PowerShell 5.1、Kernel32 `SetThreadExecutionState`、Node.js 22 `node:test`、现有 JSON 证据契约。

## Global Constraints

- 实际开发目录固定为 `E:\weatherpoem`；`D:\纯净工作台` 仅作控制与最终审计面。
- 冻结 EXE `src-tauri/target/release/weatherpoem.exe` 的 SHA-256 必须始终为 `D388D9484A7B81B1039CFAA1D21CBAD178750E5375B8FBCA7D8334A8C681609A`。
- 不重建、替换、签名或终止任何正在执行正式采样的冻结 EXE。
- 不修改发布清单、三份正式八小时证据、安装器、七天正式报告字段或统计阈值。
- 防休眠只请求 `ES_CONTINUOUS | ES_SYSTEM_REQUIRED`；禁止使用 `ES_DISPLAY_REQUIRED`、`ES_AWAYMODE_REQUIRED` 或 `powercfg`。
- 七天相邻样本的 `elapsedSeconds` 或 `recordedAt` 差值超过 150 秒即失败；不得放宽阈值或补造样本。
- `RQT-13` 保持 `partial`；防系统睡眠不等于已经测得休眠/唤醒，`sleepWakeMeasured` 继续为 `false`。
- 当前目录不是可用 Git 仓库，不初始化 Git；以每个任务后的测试结果、文件列表与 SHA-256 作为命名验证检查点。
- 不派发子代理；在当前会话按 `superpowers:executing-plans` 逐项执行和复核。

---

## 文件结构

- 修改 `scripts/test-performance-long-run.ps1`：声明预检保护配置、持有/释放执行状态租约、运行时检查样本连续性。
- 新建 `scripts/performance-seven-day-runtime-support.ps1`：提供可独立调用的执行状态与双时钟连续性函数。
- 新建 `scripts/performance-seven-day-runtime-support.test.mjs`：用真实 PowerShell 调用支持模块，只在 Kernel32 外部边界注入捕获器。
- 修改 `scripts/performance-seven-day-sampler-preflight.test.mjs`：锁定预检 JSON，并加载同职责的运行时支持行为测试，使既有 npm 校验入口自动覆盖它。
- 修改 `scripts/performance-seven-day-status-support.mjs`：透传消息，并把运行进程消失转换成结构化失败状态。
- 修改 `scripts/performance-seven-day-status-support.test.mjs`：覆盖 launcher/app 消失及正常消息字段。
- 不修改 `scripts/performance-seven-day-status.mjs`：它已原样序列化支持层返回对象，新增 `message` 会自动输出。
- 不修改 `package.json`：避免仅因测试入口变化使许可台账与冻结安装器 NOTICE 的输入链失效。
- 修改 `docs/PERFORMANCE_VERIFICATION.md`：记录防休眠、快速失败、状态降级和仍未覆盖的休眠/唤醒范围。
- 新建本计划文件：保存实现顺序、测试命令和证据封存方法。

### Task 1: 锁定七天预检保护契约

**Files:**
- Modify: `scripts/performance-seven-day-sampler-preflight.test.mjs`
- Modify: `scripts/test-performance-long-run.ps1`

**Interfaces:**
- Consumes: 现有 `-EvidenceMode seven-day -Preflight` JSON 输出。
- Produces: `continuityProtection: { systemSleepPrevented, displayRequired, maximumSampleGapSeconds, failFast }`。

- [ ] **Step 1: 先修正既有预检测试的状态无关性**

预检可能在七天证据不存在或旧失败证据仍存在时执行。为 `sevenDayPaths` 建立“缺失为 `null`、存在则为 SHA-256”的快照，断言预检前后完全相同；禁止再断言文件必定不存在。

- [ ] **Step 2: 运行既有测试并确认基线 GREEN**

Run:

```powershell
node --test scripts/performance-seven-day-sampler-preflight.test.mjs
```

Expected: 2 tests PASS；当前旧失败 checkpoint 保持原哈希，缺失的正式 report 仍然缺失。

- [ ] **Step 3: 在预检测试中写入失败断言**

在预期 JSON 的 `report` 与 `limitations` 之间加入：

```js
    continuityProtection: {
      systemSleepPrevented: true,
      displayRequired: false,
      maximumSampleGapSeconds: 150,
      failFast: true,
    },
```

- [ ] **Step 4: 运行测试并确认 RED**

Run:

```powershell
node --test scripts/performance-seven-day-sampler-preflight.test.mjs
```

Expected: FAIL；深比较显示实际输出缺少 `continuityProtection`，既有“无写入”和时长拒绝测试仍通过。

- [ ] **Step 5: 只为七天预检增加固定配置**

在 `$preflightResult` 中、`limitations` 之前加入条件字段；不要调用 `Add-Type` 或任何原生方法：

```powershell
    if ($mode -eq "seven-day") {
        $preflightResult["continuityProtection"] = [ordered]@{
            systemSleepPrevented = $true
            displayRequired = $false
            maximumSampleGapSeconds = 150
            failFast = $true
        }
    }
```

为保持输出字段顺序稳定，先创建到 `report` 为止的有序表，再插入该字段，最后赋值 `limitations`；八小时/演练预检不得出现该字段。

- [ ] **Step 6: 运行预检测试并确认 GREEN**

Run:

```powershell
node --test scripts/performance-seven-day-sampler-preflight.test.mjs
```

Expected: 2 tests PASS，受保护八小时文件哈希前后不变，七天 checkpoint/report 未被预检创建或修改。

- [ ] **Step 7: 记录验证检查点 `preflight-contract-green`**

Run:

```powershell
Get-FileHash scripts/test-performance-long-run.ps1,scripts/performance-seven-day-sampler-preflight.test.mjs -Algorithm SHA256
```

保留测试输出和两个文件哈希；不初始化 Git。

### Task 2: 把失联进程转换成结构化七天状态

**Files:**
- Modify: `scripts/performance-seven-day-status-support.test.mjs`
- Modify: `scripts/performance-seven-day-status-support.mjs`

**Interfaces:**
- Consumes: `buildSevenDayStatus({ launch, checkpoint, report, expected, currentArtifact, currentReleaseManifestSha256, currentProtectedEvidence, processAlive })`。
- Produces: 所有有效状态均包含 `message: string`；活动 launcher 或运行中 app 消失时返回 `status: "failed"`，证据完整性错误仍抛异常。

- [ ] **Step 1: 更新正常证据的消息契约**

把第一个 `selectSevenDayStatusEvidence` 深比较预期扩展为：

```js
    message: "",
```

并在正常 running 状态测试中加入：

```js
  assert.equal(status.message, "");
```

- [ ] **Step 2: 新增 launcher 与 app 消失的失败测试**

新增两个独立测试，复用现有 fixture；核心断言必须是：

```js
assert.deepEqual(
  {
    status: status.status,
    message: status.message,
    launcherAlive: status.launcherAlive,
    appAlive: status.appAlive,
  },
  {
    status: "failed",
    message: "Seven-day run says active but the launcher process exited.",
    launcherAlive: false,
    appAlive: true,
  },
);
```

第二个测试让 launcher 存活、app 消失，并要求：

```js
{
  status: "failed",
  message: "Seven-day run says running but the app process exited.",
  launcherAlive: true,
  appAlive: false,
}
```

- [ ] **Step 3: 运行状态测试并确认 RED**

Run:

```powershell
node --test scripts/performance-seven-day-status-support.test.mjs
```

Expected: 新增进程消失场景因当前实现抛异常而 FAIL；消息字段断言也因字段缺失而 FAIL。

- [ ] **Step 4: 在证据对象中稳定透传消息**

`checkpointEvidence` 返回：

```js
    message:
      typeof checkpoint.message === "string" ? checkpoint.message : "",
```

`formalReportEvidence` 返回：

```js
    message: typeof report.message === "string" ? report.message : "",
```

- [ ] **Step 5: 以局部状态变量实现进程失败降级**

在活性探测后使用：

```js
  let status = evidence.status;
  let message = evidence.message;
  if (["starting", "running"].includes(status) && !launcherAlive) {
    status = "failed";
    message = "Seven-day run says active but the launcher process exited.";
  } else if (status === "running" && !appAlive) {
    status = "failed";
    message = "Seven-day run says running but the app process exited.";
  }
```

返回对象使用局部 `status` 和 `message`，并只在 `status === "completed"` 时返回报告路径。候选哈希、清单哈希、受保护证据、路径和身份错误的现有 `throw` 全部保留。

- [ ] **Step 6: 运行状态测试并确认 GREEN**

Run:

```powershell
node --test scripts/performance-seven-day-status-support.test.mjs
```

Expected: 全部测试 PASS；原有 frozen candidate 负例仍然抛错。

- [ ] **Step 7: 用当前失联证据验证 CLI 输出**

Run:

```powershell
npm.cmd run performance:seven-day:status
```

Expected: 退出码 0；输出 JSON 中 `runId` 为 `fe304adc0d244d25b2b285e934761687`、`status` 为 `failed`、`launcherAlive` 和 `appAlive` 均为 `false`，且无 Node 堆栈。

### Task 3: 用可执行行为测试驱动系统唤醒租约与连续性快速失败

**Files:**
- Create: `scripts/performance-seven-day-runtime-support.ps1`
- Create: `scripts/performance-seven-day-runtime-support.test.mjs`
- Modify: `scripts/test-performance-long-run.ps1`
- Modify: `scripts/performance-seven-day-sampler-preflight.test.mjs`

**Interfaces:**
- Consumes: 可选 `NativeCall([uint32] flags) -> uint32` 外部边界、`EvidenceMode`、相邻样本的 `elapsedSeconds` 与 ISO `recordedAt`。
- Produces: `Enter-SevenDayExecutionState`、`Exit-SevenDayExecutionState`、`Assert-SevenDaySampleContinuity`；获取标志固定为十进制 `2147483649`，释放标志固定为 `2147483648`；空洞失败消息固定为 `Seven-day sample continuity exceeded 150 seconds.`。

- [ ] **Step 1: 新增真实 PowerShell 行为测试文件**

`scripts/performance-seven-day-runtime-support.test.mjs` 使用 Node `spawnSync` 通过 `-EncodedCommand` 点入生产支持模块。公共执行器为：

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const supportPath = path.join(
  projectRoot,
  "scripts",
  "performance-seven-day-runtime-support.ps1",
);

function runPowerShell(body) {
  const quotedPath = supportPath.replaceAll("'", "''");
  const script = [
    '$ErrorActionPreference = "Stop"',
    `. '${quotedPath}'`,
    body,
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { cwd: projectRoot, encoding: "utf8" },
  );
}
```

第一个测试通过唯一允许的外部边界捕获器执行真实生产函数，并断言获取不含 display/away 标志、释放只保留 continuous：

```js
test("execution-state lease requests system awake and restores continuous", () => {
  const result = runPowerShell(`
$script:flags = @()
$nativeCall = {
    param([uint32]$Flags)
    $script:flags += $Flags
    return [uint32]1
}
$held = Enter-SevenDayExecutionState -NativeCall $nativeCall
$released = Exit-SevenDayExecutionState -Held $held -NativeCall $nativeCall
[pscustomobject]@{
    held = $held
    released = $released
    enterFlags = $script:flags[0]
    exitFlags = $script:flags[1]
} | ConvertTo-Json -Compress
`);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    held: true,
    released: true,
    enterFlags: 2_147_483_649,
    exitFlags: 2_147_483_648,
  });
});
```

再添加三个行为：原生获取返回 0 必须以 `Could not prevent system sleep for seven-day sampling.` 失败；恰好 150 秒的双时钟差通过；`elapsedSeconds` 或 `recordedAt` 任一为 151 秒时分别以固定连续性消息失败。

- [ ] **Step 2: 运行新增测试并确认 RED**

Run:

```powershell
node --test scripts/performance-seven-day-runtime-support.test.mjs
```

Expected: 测试因生产支持模块尚不存在而 FAIL；失败来自缺失模块/函数，不是 JS 语法错误。

- [ ] **Step 3: 创建最小运行时支持模块**

`scripts/performance-seven-day-runtime-support.ps1` 定义：

```powershell
Set-StrictMode -Version Latest

$script:EsContinuous = [uint32]2147483648
$script:EsSystemRequired = [uint32]1
$script:MaximumSevenDaySampleGapSeconds = 150.0

function Invoke-WeatherPoemExecutionState {
    param([uint32]$Flags)
    if ($null -eq ("WeatherPoemNativePower" -as [type])) {
        Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public static class WeatherPoemNativePower
{
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint executionState);
}
"@
    }
    return [uint32][WeatherPoemNativePower]::SetThreadExecutionState($Flags)
}

function Enter-SevenDayExecutionState {
    param([scriptblock]$NativeCall = $null)
    $requested = [uint32](
        $script:EsContinuous -bor $script:EsSystemRequired
    )
    $previous = if ($null -eq $NativeCall) {
        Invoke-WeatherPoemExecutionState -Flags $requested
    } else {
        & $NativeCall $requested
    }
    if ([uint32]$previous -eq 0) {
        throw "Could not prevent system sleep for seven-day sampling."
    }
    return $true
}

function Exit-SevenDayExecutionState {
    param(
        [bool]$Held,
        [scriptblock]$NativeCall = $null
    )
    if (-not $Held) { return $true }
    $restored = if ($null -eq $NativeCall) {
        Invoke-WeatherPoemExecutionState -Flags $script:EsContinuous
    } else {
        & $NativeCall $script:EsContinuous
    }
    return ([uint32]$restored -ne 0)
}

function Assert-SevenDaySampleContinuity {
    param(
        [ValidateSet("eight-hour", "seven-day", "rehearsal")]
        [string]$EvidenceMode,
        [object]$PreviousSample,
        [object]$CurrentSample
    )
    if ($EvidenceMode -ne "seven-day" -or $null -eq $PreviousSample) {
        return
    }
    $elapsedGap = [double]$CurrentSample.elapsedSeconds -
        [double]$PreviousSample.elapsedSeconds
    $recordedGap = (
        [DateTimeOffset]::Parse([string]$CurrentSample.recordedAt) -
        [DateTimeOffset]::Parse([string]$PreviousSample.recordedAt)
    ).TotalSeconds
    if (
        $elapsedGap -gt $script:MaximumSevenDaySampleGapSeconds -or
        $recordedGap -gt $script:MaximumSevenDaySampleGapSeconds
    ) {
        throw "Seven-day sample continuity exceeded 150 seconds."
    }
}
```

- [ ] **Step 4: 运行支持模块测试并确认 GREEN**

Run:

```powershell
node --test scripts/performance-seven-day-runtime-support.test.mjs
```

Expected: 获取/释放、原生失败、150 秒边界、两个 151 秒失败场景全部 PASS。

- [ ] **Step 5: 把支持模块接入采样器唯一正确生命周期**

在 `-Preflight` 提前退出之后，仅为真实七天路径点入模块：

```powershell
if ($mode -eq "seven-day") {
    . (Join-Path $PSScriptRoot "performance-seven-day-runtime-support.ps1")
}
```

在 `try` 前初始化 `$executionStateHeld = $false`；在主窗口成功关闭到托盘之后、Stopwatch 启动之前获取租约：

```powershell
if ($mode -eq "seven-day") {
    $executionStateHeld = Enter-SevenDayExecutionState
}
```

在最外层 `finally` 中，终止本轮自己启动的应用之后、清理临时目录之前释放：

```powershell
if ($mode -eq "seven-day") {
    $released = Exit-SevenDayExecutionState -Held $executionStateHeld
    if (-not $released) {
        [Console]::Error.WriteLine(
            "Could not release the seven-day system sleep requirement."
        )
    }
    $executionStateHeld = $false
}
```

- [ ] **Step 6: 在追加样本之前执行真实双时钟检查**

把内联 `$samples.Add(...)` 改为先构建 `$currentSample`，然后：

```powershell
$previousSample = if ($samples.Count -gt 0) {
    $samples[$samples.Count - 1]
} else {
    $null
}
if ($mode -eq "seven-day") {
    Assert-SevenDaySampleContinuity `
        -EvidenceMode $mode `
        -PreviousSample $previousSample `
        -CurrentSample $currentSample
}
$samples.Add($currentSample)
```

现有 `catch` 继续写 `failed` checkpoint；现有最终报告校验器保持不变。

- [ ] **Step 7: 通过既有预检测试入口加载行为测试**

在 `scripts/performance-seven-day-sampler-preflight.test.mjs` 中加入副作用导入：

```js
import "./performance-seven-day-runtime-support.test.mjs";
```

保持 `package.json` 字节不变；现有 `performance:long-run:check` 与
`performance:seven-day:check` 已显式执行预检测试入口，因此会自动注册并运行新增行为测试。

- [ ] **Step 8: 运行采样器与状态契约并确认 GREEN**

Run:

```powershell
node --test scripts/performance-seven-day-runtime-support.test.mjs scripts/performance-seven-day-sampler-preflight.test.mjs scripts/performance-seven-day-status-support.test.mjs
```

Expected: 全部测试 PASS；预检不点入支持模块、不调用原生执行状态、不写证据。

### Task 4: 文档与完整回归验证

**Files:**
- Modify: `docs/PERFORMANCE_VERIFICATION.md`
- Verify only: `package.json`
- Verify only: `src-tauri/target/release/weatherpoem.exe`
- Verify only: `output/WeatherPoem_0.2.0_RELEASE.json`
- Verify only: 三份正式八小时证据

**Interfaces:**
- Consumes: 已通过的目标测试和既有 npm 校验入口。
- Produces: 用户可复核的运行说明、不可变证据哈希清单和完整回归结果。

- [ ] **Step 1: 更新七天工具说明**

在 `docs/PERFORMANCE_VERIFICATION.md` 第 6 节补充四点：

```text
正式七天采样期间，采样器以进程级 Windows 执行状态请求阻止系统睡眠或
Modern Standby，但不要求显示器常亮，也不修改全局电源计划。任一相邻样本的
累计时间或 UTC 记录时间间隔超过 150 秒时，本轮立即失败。活动检查点对应的
launcher/app 消失时，状态命令返回结构化 failed JSON。该保护不构成休眠/唤醒
功能证据，sleepWakeMeasured 仍为 false。
```

- [ ] **Step 2: 运行七天与八小时专项回归**

Run:

```powershell
npm.cmd run performance:long-run:check
npm.cmd run performance:eight-hour:check
```

Expected: 两个命令退出码 0；现有正式八小时报告继续通过，七天契约/预检/状态支持测试通过。

- [ ] **Step 3: 运行项目与发布回归**

Run:

```powershell
npm.cmd run check
npm.cmd run release:verify
```

Expected: 两个命令退出码 0。若出现失败，按 `superpowers:systematic-debugging` 先定位，禁止用重建冻结 EXE绕过。

- [ ] **Step 4: 封存不可变哈希**

Run:

```powershell
$expected = @{
  'src-tauri/target/release/weatherpoem.exe' = 'D388D9484A7B81B1039CFAA1D21CBAD178750E5375B8FBCA7D8334A8C681609A'
  'output/WeatherPoem_0.2.0_RELEASE.json' = '47FC4ECB1E21314AC94928134E55A1A82EE8E331C719B8598148F75CD57F3C59'
  'output/WeatherPoem_0.2.0_PERFORMANCE_8H_LAUNCH.json' = '475CFC066DFEB152E578756683FB2A1749AF5C8CF60A249BB1F2C87DA2A29B58'
  'output/WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_CHECKPOINT.json' = 'AADD88C1394AA2E998D7060C34B850F06E74599FCF2BE283ABDEA8686D1543F3'
  'output/WeatherPoem_0.2.0_PERFORMANCE_8H.json' = 'E150190D3D3E32865E8642C8616FC52CA3E047786EBAF727DAAB8FD65C2EDC4C'
}
foreach ($entry in $expected.GetEnumerator()) {
  $actual = (Get-FileHash -LiteralPath $entry.Key -Algorithm SHA256).Hash
  if ($actual -ne $entry.Value) { throw "Protected hash changed: $($entry.Key)" }
}
'PROTECTED_HASHES_MATCH'
```

Expected: `PROTECTED_HASHES_MATCH`。

- [ ] **Step 5: 记录验证检查点 `guard-regression-green`**

保留四个命令的退出码、当前修改文件列表与 SHA-256；不生成或替换 EXE。

### Task 5: 归档无效运行并启动新的正式七天长测

**Files:**
- Runtime archive glob: `output/performance-7d-archive/WeatherPoem_0.2.0_PERFORMANCE_7D_LAUNCH_fe304adc0d244d25b2b285e934761687_*.json`
- Runtime archive glob: `output/performance-7d-archive/WeatherPoem_0.2.0_PERFORMANCE_7D_CHECKPOINT_fe304adc0d244d25b2b285e934761687_*.json`
- Runtime create: `output/WeatherPoem_0.2.0_PERFORMANCE_7D_LAUNCH.json`
- Runtime create: `output/WeatherPoem_0.2.0_PERFORMANCE_7D_CHECKPOINT.json`

**Interfaces:**
- Consumes: 修复后的启动器/采样器、同一冻结 EXE、当前发布清单和三份八小时证据。
- Produces: 新 32 位十六进制 `runId`、存活 launcher/app、首个连续样本和可供后续 heartbeat 监控的新正式运行。

- [ ] **Step 1: 做最后一次只读预检**

Run:

```powershell
npm.cmd run performance:seven-day:start -- -Preflight
```

Expected: `stateChanged: false`，采样器配置含 `systemSleepPrevented: true`、`displayRequired: false`、`maximumSampleGapSeconds: 150`、`failFast: true`；旧 launch/checkpoint 哈希不变。

- [ ] **Step 2: 启动新一轮正式七天长测**

Run:

```powershell
npm.cmd run performance:seven-day:start
```

Expected: 启动器识别旧 launcher/app 均已死亡，把 runId `fe304adc0d244d25b2b285e934761687` 的旧 launch/checkpoint（以及仅在存在时的正式 report）按 UTC 时间戳归档，再写入新的 launch/checkpoint；命令不等待 168 小时。旧 stdout/stderr 已带旧 runId，启动器保留在根输出目录，不覆盖它们。

- [ ] **Step 3: 核验新身份、首个样本和进程**

Run:

```powershell
npm.cmd run performance:seven-day:status
```

Expected: 新 `runId` 不等于 `fe304adc0d244d25b2b285e934761687`；`status` 为 `starting` 或 `running`；launcher/app 均存活；冻结 EXE 哈希仍等于全局约束值。若已进入 `running`，等待至少一个自然采样周期后再次执行 status，要求 `sampleCount >= 1` 且 `message` 为空。

- [ ] **Step 4: 核验旧证据归档且未冒充通过报告**

Run:

```powershell
rg --files output/performance-7d-archive
```

Expected: 归档目录能找到旧 runId 对应的 launch 与 checkpoint；根输出目录仍保留旧 runId 的 stdout/stderr；不存在把旧 runId 绑定成 `WeatherPoem_0.2.0_PERFORMANCE_7D.json` 通过报告的文件。

- [ ] **Step 5: 记录验证检查点 `fresh-seven-day-running`**

记录新 runId、launcher PID、app PID、首样本时间、冻结 EXE SHA-256 与四份受保护证据哈希。此后不重建、不替换、不终止冻结 EXE，也不并行执行 NSIS/MSI 或其他会启动 WeatherPoem 的生命周期测试。

- [ ] **Step 6: 交还既有 heartbeat 持续监控**

后续 heartbeat 只运行 `npm.cmd run performance:seven-day:status` 并复核进程/哈希；只有状态自然变为 `completed` 才运行 `npm.cmd run performance:seven-day:check`。最终目标仍需等待新一轮 168 小时自然完成、派生产物刷新、最终 DOCX 逐页验收，以及从 `D:\纯净工作台` 运行 `weatherpoem-verify`。
