# WeatherPoem 七天长测防休眠与快速失败设计补充

日期：2026-08-06  
状态：已复核，按用户“持续推进”授权进入实施  
适用范围：WeatherPoem 0.2.0 七天连续托盘稳定性证据管线  
上位设计：`docs/superpowers/specs/2026-08-05-seven-day-performance-evidence-design.md`

## 1. 背景与已证实问题

第一轮正式七天长测使用 `runId = fe304adc0d244d25b2b285e934761687`，绑定的冻结 EXE SHA-256 为 `D388D9484A7B81B1039CFAA1D21CBAD178750E5375B8FBCA7D8334A8C681609A`。

运行证据表明：

- 检查点从 2026-08-05T16:18:27Z 到 2026-08-05T22:48:32Z 没有连续采样；
- Windows `Microsoft-Windows-Kernel-Power` 事件 506/507 证明本机在对应时段进入并退出 Modern Standby；
- 样本数只从 338 增至 339，而 `elapsedSeconds` 增加约 6.5 小时；
- 原有校验器要求至少 10,080 个样本，且相邻 `elapsedSeconds` 与 `recordedAt` 间隔均不得超过 150 秒，因此该轮证据确定无法通过；
- 采样器按墙钟 10,080 分钟结束，不会为睡眠期间缺失的样本补时；
- 后续 launcher 与应用进程均已退出，但检查点仍为 `running`，正式报告和错误日志均未生成；
- `performance:seven-day:status` 在这种状态下抛出未处理错误，而不是返回可供自动化消费的失败状态。

根因不是 WeatherPoem 的 CPU、内存或托盘行为，而是七天采样器没有声明 Windows 系统执行需求，也没有在采样循环内对连续性空洞快速失败。状态命令同时缺少“检查点声称活动、相关进程已经退出”的结构化降级路径。

## 2. 目标

修复后的正式七天管线必须：

1. 在七天采样期间阻止 Windows 进入系统睡眠或 Modern Standby；
2. 允许显示器按用户设置关闭，不强制屏幕常亮；
3. 不修改全局电源计划，不要求管理员权限；
4. 在任何相邻样本间隔超过 150 秒时立即写入 `failed` 检查点并结束本轮，而不是继续运行数天；
5. 在 launcher 或应用异常消失时让状态命令返回结构化 `failed` 结果；
6. 保持正式报告结构、统计阈值、八小时证据和冻结 EXE 完全不变；
7. 归档第一轮无效七天文件后，使用同一冻结 EXE 从零启动新的正式七天长测。

## 3. 方案比较与选择

### 方案 A：采样器持有 Windows 执行状态租约（采用）

在 `scripts/test-performance-long-run.ps1` 内通过 `SetThreadExecutionState` 请求 `ES_CONTINUOUS | ES_SYSTEM_REQUIRED`。请求只在正式 `seven-day` 模式的采样阶段生效，并在 `finally` 中通过 `ES_CONTINUOUS` 释放。

优点：作用域跟随采样器进程；不需要管理员权限；不会修改用户电源计划；允许显示器关闭；采样器异常退出时 Windows 会自然撤销进程级请求。缺点：仅适用于 Windows，但当前产品和证据管线本来就是 Windows 专用。

### 方案 B：调用 `powercfg` 修改全局电源计划（不采用）

优点是实现直观。缺点是通常需要提升权限，会改变整机设置，清理失败时影响用户后续使用，也难以证明测试结束后已完整恢复。

### 方案 C：启动独立 keep-awake 辅助进程（不采用）

优点是不修改采样器主体。缺点是增加额外 PID、日志和生命周期耦合；辅助进程异常退出后主采样器难以及时发现，反而扩大了证据不确定性。

## 4. 设计范围

### 4.1 七天模式执行状态租约

`scripts/test-performance-long-run.ps1` 增加一个最小 Windows 原生互操作封装，并提供两个职责清晰的函数：

- 获取租约：请求 `ES_CONTINUOUS | ES_SYSTEM_REQUIRED`；返回值为零时立即失败，不启动正式采样；
- 释放租约：请求 `ES_CONTINUOUS`；只在租约确实获取成功后执行。

租约获取点位于应用完成首帧准备、主窗口成功关闭到托盘之后，正式计时器启动之前。租约释放位于现有最外层 `finally`，并先于采样器清理临时目录结束。八小时模式和演练模式保持现状，不自动启用该租约。

不使用 `ES_DISPLAY_REQUIRED`，因此本设计不阻止屏幕关闭。也不使用 `ES_AWAYMODE_REQUIRED`，避免改变媒体或后台会话语义。

### 4.2 连续性快速失败

七天采样循环在准备追加新样本时，对比新旧样本的：

- `elapsedSeconds` 差值；
- `recordedAt` 的 UTC 时间差。

任一差值超过 150 秒即抛出明确错误：`Seven-day sample continuity exceeded 150 seconds.`。现有 `catch` 负责写入 `status = failed`、保留已采样数量、最后样本和错误消息；现有 `finally` 只终止本轮采样器自己启动的 WeatherPoem，并释放执行状态租约。

该检查只在 `seven-day` 模式启用。八小时和演练模式不改变，以保持已经验收的行为兼容性。最终报告校验器仍保留同一连续性复算，形成“运行时快速失败 + 事后独立复算”双重防线。

### 4.3 结构化异常状态

`scripts/performance-seven-day-status-support.mjs` 对下列不一致返回 `status = failed`，不再抛出未处理错误：

- 检查点为 `starting` 或 `running`，但 launcher PID 不存在；
- 检查点为 `running`，但应用 PID 不存在。

状态对象新增稳定字段：

```json
{
  "message": "Seven-day run says active but the launcher process exited."
}
```

正常运行时 `message` 为检查点消息或空字符串；自然完成时为报告消息或空字符串。哈希不匹配、证据路径越界、JSON 损坏和身份不匹配仍然抛错，因为这些属于证据完整性错误，不能降级成普通运行失败。

### 4.4 预检可见性

七天采样器的 `-Preflight` 输出增加：

```json
{
  "continuityProtection": {
    "systemSleepPrevented": true,
    "displayRequired": false,
    "maximumSampleGapSeconds": 150,
    "failFast": true
  }
}
```

预检只说明即将使用的固定行为，不调用原生 API、不创建进程、不写入检查点，也不改变系统状态。八小时预检保持原有输出契约。

## 5. 文件边界

允许修改：

- `scripts/test-performance-long-run.ps1`
- `scripts/performance-seven-day-runtime-support.ps1`（新增；只承载可测试的执行状态与连续性函数）
- `scripts/performance-seven-day-runtime-support.test.mjs`（新增；通过真实 PowerShell 调用验证行为）
- `scripts/performance-seven-day-sampler-preflight.test.mjs`
- `scripts/performance-seven-day-status-support.mjs`
- `scripts/performance-seven-day-status-support.test.mjs`
- `scripts/performance-seven-day-status.mjs`（仅在需要透传 `message` 时）
- `docs/PERFORMANCE_VERIFICATION.md`
- 与本补充设计对应的实施计划文档

不得修改：

- `src-tauri/target/release/weatherpoem.exe`
- `output/WeatherPoem_0.2.0_RELEASE.json`
- 三份八小时正式证据
- NSIS、MSI、签名或安装生命周期产物
- 七天正式报告的既有字段与统计阈值
- `RQT-13` 的完整状态

上一轮无效七天 launch/checkpoint 文件只能由现有七天启动器在新一轮启动前归档到 `output/performance-7d-archive/`，不得覆盖或冒充通过报告。

## 6. 测试策略

实现严格遵循测试先行：

1. 先扩展预检测试，要求七天模式声明防系统睡眠、允许显示器关闭、150 秒阈值和快速失败；运行并确认因字段缺失而失败；
2. 先扩展状态支持测试，构造活动检查点但 launcher/app 已退出的场景，要求返回结构化 `failed` 与精确消息；运行并确认当前实现抛错；
3. 先通过 Node 启动真实 PowerShell 支持模块，验证获取时只发送
   `0x80000001`、释放时只发送 `0x80000000`、原生调用失败会中止，以及双时钟
   任一超过 150 秒会失败；Windows 原生调用作为唯一外部边界允许注入捕获器；
4. 实现最小 PowerShell 执行状态租约和连续性检查；
5. 实现最小状态降级逻辑与 `message` 透传；
6. 运行七天预检测试、运行时支持测试、状态测试、七天报告契约以及八小时/演练回归测试；
7. 运行 `npm.cmd run performance:long-run:check` 和 `npm.cmd run performance:eight-hour:check`，证明既有正式证据仍有效；
8. 运行 `npm.cmd run check` 与 `npm.cmd run release:verify`；
9. 重新计算冻结 EXE、发布清单和三份八小时证据的 SHA-256，必须与第一轮 launch 记录一致；
10. 在不启动应用的 `-Preflight` 中确认新保护配置；
11. 归档无效 run 后启动新七天 run，并在首个样本后再次核验进程和所有保护哈希。

快速测试不能证明系统在未来七天一定不睡眠。最终验收仍必须依赖新一轮真实 168 小时测量、10,080 个以上样本、无超过 150 秒空洞以及正式复算通过。

## 7. 失败与恢复行为

- 获取执行状态租约失败：不进入正式采样；检查点写为 `failed`，消息说明 Windows 执行状态请求失败；
- 连续性超过 150 秒：立即写入 `failed` 检查点并清理本轮应用；
- launcher 或应用异常消失：状态命令返回结构化 `failed`，保留最后检查点内容；
- 哈希或受保护证据变化：状态和正式校验继续硬失败，不自动重启；
- 新一轮失败：保留 launch、checkpoint、stdout、stderr，不自动启动第三轮；
- 系统正常保持唤醒：屏幕可以关闭，采样器每 60 秒记录一次样本，直到自然完成。

## 8. 验收标准

工具修复完成必须同时满足：

- 所有新增测试均经历预期 RED 后转为 GREEN；
- 七天预检明确声明防系统睡眠且不要求显示器常亮；
- 活动检查点对应进程消失时，状态命令输出 JSON `failed`，不打印 Node 堆栈；
- 八小时与演练行为、七天报告结构和全部统计阈值保持兼容；
- 冻结 EXE SHA-256 仍为 `D388D9484A7B81B1039CFAA1D21CBAD178750E5375B8FBCA7D8334A8C681609A`；
- 发布清单与三份八小时证据哈希未变化；
- 新 run 使用新的 `runId`，第一轮无效证据被单独归档；
- 新 run 的 launcher 与 app 存活，首个样本、保护哈希和预检配置均通过核验。

项目目标仍只有在新一轮七天长测自然完成、`performance:seven-day:check` 通过、派生产物刷新并从 `D:\纯净工作台` 运行 `weatherpoem-verify` 后才算完成。
