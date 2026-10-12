# WeatherPoem 性能验证

## 1. 目的

本项目把“快速启动”和“低资源占用”拆成可复验的自动证据与仍需人工执行的长稳门禁，避免用单次启动结果代替完整性能结论。

自动性能证据覆盖：

- 当前发布 EXE 的 10 次独立干净账户冷启动；
- 10 次预置北京设置的已配置账户启动，并确认最终到达诗笺视图；
- 从进程启动到 Vue 初始化、最终视图显示并经过两次绘制帧的就绪标记；
- 诗笺最终视图自身的首帧耗时；
- 按 `live-weather` 与 `offline-rules` 分组复算内容准备 P95，允许真实网络波动造成混合样本；
- 关闭到托盘后的 60 秒 CPU 与工作集内存采样；
- 每类 3 次的立即离线、天气超时和模拟官方预警受控矩阵；
- 关闭到托盘后的两分钟长稳采样器演练，每 5 秒记录 CPU 时间和工作集；
- 报告与当前 EXE 版本、尺寸和 SHA-256 绑定。

所有测量账户均位于系统临时目录下以 `WeatherPoem.Performance.` 开头的独立目录。应用在性能模式下把 SQLite 数据库和 WebView 用户数据目录显式指向该目录，脚本同时隔离 `APPDATA`、`LOCALAPPDATA`，不读取或修改真实用户数据。目录不满足临时目录和固定前缀约束时，应用与脚本都会拒绝进入性能模式。

受控矩阵中的天气与预警均为隔离合成场景，长稳演练也只有两分钟；当前正式八小时
托盘空闲证据已经完成并通过。现有证据仍不覆盖真实在线天气/AI 服务、真实官方
预警、七天跨日与休眠/唤醒、内容更新原子性、七天事件积压和具名质量签署。因此
所有性能报告中的 `gateSatisfied` 继续保持 `false`，`RQT-13` 仍为 `partial`。

## 2. 执行

先退出所有 WeatherPoem 进程并构建候选版：

```powershell
cd E:\weatherpoem
npm run tauri:build
npm run performance:smoke
npm run performance:fault-matrix
npm run performance:long-run:rehearsal
npm run performance:check
```

默认执行 10 次干净启动、10 次已配置诗笺启动和 60 秒空闲采样，每秒采样一次。报告位于：

```text
output/WeatherPoem_0.2.0_PERFORMANCE_SMOKE.json
output/WeatherPoem_0.2.0_PERFORMANCE_FAULT_MATRIX.json
output/WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_REHEARSAL.json
```

测试拒绝在已有 WeatherPoem 进程时运行，防止单实例机制把旧进程误记为新候选。测试只终止自己启动且持有对象引用的进程；临时目录必须解析到系统临时目录下且名称以 `WeatherPoem.Performance.` 开头，才允许清理。

正式八小时托盘测试由具名质量负责人在冻结候选上执行：

```powershell
npm run performance:long-run
```

需要让采样在隐藏进程中持续运行时：

```powershell
npm run performance:eight-hour:start
```

该命令默认运行 480 分钟、每 60 秒采样，并把进行中状态持续写入
`output/WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_CHECKPOINT.json`。非演练模式拒绝
少于 480 分钟的参数；两分钟演练报告不能被校验为八小时证据。完成后执行
`npm run performance:eight-hour:check`；校验器要求至少 480 个一分钟样本，
并根据 CPU 时间、墙钟时间、处理器数量及全部内存样本独立复算。

## 3. 自动冒烟阈值

| 指标 | 阈值 | 与完整门禁的关系 |
|---|---:|---|
| 干净启动外部观察 P95 | ≤ 2,000 ms | 本地初始化候选基线 |
| 已配置诗笺首帧 P95 | ≤ 300 ms | 最终视图绘制基线 |
| 在线内容准备 P95 | ≤ 5,000 ms | 仅在出现在线子样本时判定 |
| 离线规则降级准备 P95 | ≤ 2,000 ms | 仅在出现离线子样本时判定 |
| 托盘空闲 CPU | 平均 < 0.2% | 只采 60 秒，不替代八小时 |
| 托盘空闲内存 | P95 < 100 MiB | 只采 60 秒，不替代八小时 |

内容准备样本可以同时包含在线和离线模式。校验器会按每次样本的最终模式重新分组，分别复算两个 P95；没有出现的模式会保留为“未测量”，不会被当作通过。总结果只要求本次实际出现的每一类模式都达到对应阈值。

当前绑定候选 EXE 的最新短性能烟测结果：

| 指标 | 结果 |
|---|---:|
| 干净启动外部观察 P95 | 955.87 ms（通过） |
| 离线规则准备 P95（10 次） | 1,883.66 ms（通过） |
| 诗笺首帧 P95（10 次） | 91.6 ms（通过） |
| 托盘空闲 CPU 平均 | 0% |
| 托盘空闲内存 P95 | 29.40 MiB |

本轮于 2026-08-05 在无显著外部负载的受控环境执行，报告结果为
`automated-smoke-passed`，并通过 `npm run performance:check`。本轮没有产生在线
样本，因此在线准备仍是未测量。报告绑定的 EXE SHA-256 为
`D388D9484A7B81B1039CFAA1D21CBAD178750E5375B8FBCA7D8334A8C681609A`；短性能
通过只证明上表及本次实际出现的离线模式，不代表完整 RQT-13 已通过。

## 4. 受控故障、演练与正式八小时结果

受控矩阵为每个样本创建独立 SQLite/WebView 账户，并且只有同时进入合法性能
账户时才能读取场景环境变量。场景参数不会成为普通用户可用的产品开关。

当前受控故障矩阵与两分钟演练报告已于 2026-08-05 重新生成，均绑定上述当前候选
并通过 `npm run performance:check`。故障矩阵只覆盖隔离注入的立即离线、天气超时
和模拟官方预警；两分钟演练只证明采样器与短时托盘行为，不能替代真实端点、八小时
正式证据或七天长稳。

当前正式八小时长测绑定 EXE SHA-256
`D388D9484A7B81B1039CFAA1D21CBAD178750E5375B8FBCA7D8334A8C681609A`，
`runId=33be449f01544d368baa862bdfd731b4`，已完成 480/480 个一分钟样本。
launcher 与应用进程均自然退出，`npm run performance:eight-hour:check` 正式门禁
通过。该结论只覆盖八小时托盘空闲范围，不证明七天稳定性、休眠唤醒、真实网络或
具名质量批准。

## 5. 完整 RQT-13 仍需执行

冻结校园试点候选后，由具名质量负责人补齐：

1. 真实天气以及启用受控 AI 理由服务时的在线准备多次 P95；
2. 在真实服务环境复核断网、天气接口超时、AI 关闭与官方预警；合成矩阵不能代替
   真实端点；
3. 连续七天跨日、休眠、唤醒和重复弹出检查；
4. 正常、断电模拟和损坏内容包的原子切换；
5. 断网七天后的事件积压恢复；
6. 缺陷、例外理由和具名签署。

最终证据写入 `review/evidence/RQT-13-performance-long-run.json`。在该文件通过证据契约前，不得把性能门禁声明为完成。

## 6. 七天连续运行工具

七天长测使用独立证据管线，不覆盖已经通过的八小时报告。工具固定运行 10,080 分钟，
每 60 秒采样一次，并把运行标识、当前发布清单、冻结 EXE 的大小与 SHA-256 以及三份
八小时证据哈希写入启动记录。

只读预检：

```powershell
npm run performance:seven-day:start -- -Preflight
```

正式启动、查看状态和完成后校验：

```powershell
npm run performance:seven-day:start
npm run performance:seven-day:status
npm run performance:seven-day:check
```

七天模式只写入：

```text
output/WeatherPoem_0.2.0_PERFORMANCE_7D_LAUNCH.json
output/WeatherPoem_0.2.0_PERFORMANCE_7D_CHECKPOINT.json
output/WeatherPoem_0.2.0_PERFORMANCE_7D.json
```

正式校验要求至少 10,080 个样本和 604,800 秒墙钟时长，样本覆盖至少七个 UTC 日期，
相邻样本的墙钟时间与累计时间均不得出现超过 150 秒的空洞。检测到空洞时，“七天连续
运行”失败；不能通过放宽阈值把机器休眠冒充连续采样。

正式七天采样期间，采样器以进程级 Windows 执行状态请求阻止系统睡眠或 Modern
Standby 的空闲自动进入，但不要求显示器常亮，也不修改全局电源计划。Windows 不允许
应用覆盖用户发起的合盖、按电源键或手动选择睡眠；Modern Standby 设备在电池供电下也
可能终止应用电源请求。因此正式运行必须持续连接交流电，且不得合盖（除非测试机已由
操作者把合盖动作设为“不采取任何操作”）、手动睡眠或手动休眠。启动器会先验证交流
供电，采样器每分钟重新验证交流供电并续租执行状态。任一相邻样本的累计时间或 UTC
记录时间间隔超过 150 秒时，本轮立即写入失败检查点并结束。活动检查点对应的
launcher 或应用进程消失时，状态命令返回结构化 `failed` JSON，而不是输出未处理堆栈。
该保护不构成休眠/唤醒功能证据，`sleepWakeMeasured` 仍为 `false`。

第二轮正式运行 `runId=36596379e50a470caa08c5961cd27506` 未生成通过报告。系统事件
日志证明测试机于 2026-08-07 00:10（北京时间）断开交流电（Kernel-Power 105，
`AcOnline=false`）并因合盖进入 Modern Standby（Kernel-Power 506，原因 `Lid`）；
随后因固定超时转入休眠，直至 20:17 恢复。最后有效样本为 00:14:19，共 298 个，恢复
后正确触发 150 秒连续性门禁。该失败不是 WeatherPoem CPU、内存或托盘存活阈值失败，
也不能冒充七天通过证据。失败检查点和 run-specific stdout/stderr 保留供审计；下一轮由
启动器归档 launch/checkpoint 后从零开始。

运行期间不得重建、替换或签名冻结 EXE，也不得并行执行会启动 WeatherPoem 的单实例、
窗口位置、性能或安装生命周期测试。状态命令会重新计算冻结 EXE、发布清单和三份八小时
证据的哈希，任一变化都会拒绝继续认可本次运行。

当前七天工具已就绪，但真实 168 小时报告尚未生成。即使后续七天连续运行通过，
休眠/唤醒仍需独立人工证据，真实天气、AI、官方预警、内容更新、事件积压恢复和具名质量
签署也仍需分别完成，因此 `RQT-13` 继续保持 `partial`。只有
`performance:seven-day:check` 通过后，才允许更新需求追踪中的七天子项。
