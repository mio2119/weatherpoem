# T09 真机可访问性与资源表现阶段记录

状态：**部分通过；最新内部候选的离线短测和受控故障矩阵已复算通过，但系统矩阵和在线性能尚未验收**。本记录只属于 `redesign/phase-1` 源码、隔离的 Windows 开发窗口及内部测试 EXE，不把旧 0.2.0 EXE 的性能或设备报告当作新版通过证据。下文原有失败数据保留为第一轮历史结果，不能误读为最新候选的结果。

2026-10-20 对同一 `D68E286A…` EXE 增加[真实接口晚到诊断及画面](./evidence/T09_NATIVE_LIVE_WEATHER_NATURAL_RESETINLINE_20261020.json)，由[只读复核器](../../scripts/redesign-live-weather-check.mjs)核验。WebView2 首个请求资源耗时 `1121 ms`，首屏仍为 `offline-rules` 和“天气未更新”的《暮江吟》；这与源码默认 `1100 ms` 截止相符，但不能仅凭资源计时证明网络请求已完整返回。**在诊断脚本不发额外请求的八秒内**，应用自己的后续请求资源耗时 `965.6 ms`，本地缓存标明 `open-meteo`，画面更新为真实小雨《山居秋暝》；SQLite 当日状态指向新诗，展示历史保留前后两首。随后脚本才独立发一次只读请求，得到 HTTP 200，用于区别接口不可达。已查看[最终小窗](./evidence/T09_NATIVE_LIVE_WEATHER_NATURAL_RESETINLINE_20261020_after.png)：实况标为“小雨”，没有“隔离演练”伪装。这个单机北京样本证明晚到真实数据能自然应用，**不产生在线首屏样本**，不能将短测报告 `onlineReadyMeasured=false` 或 `gateSatisfied=false` 改成通过；其他城市/网络、首屏延迟分布、真实预警及长期稳定性仍待验。A9 **部分通过**。

2026-10-20 最新未签名、未安装内部 EXE `D68E286A2C5F2262079078921804134917CBB8C6836E1AB2D8036307E8F1325B` 的[同哈希短测](./evidence/T09_PERFORMANCE_SMOKE_reset-inline-20261020.json)经 `performance-smoke-check --candidate=reset-inline-20261020` 独立复算：10 次干净启动就绪 P95 `584.94 ms`，10 次已配置诗笺首帧 P95 `134.1 ms`、离线准备 P95 `1702.63 ms`；60 秒托盘空闲主进程 CPU 平均 `0%`、工作集 P95 `30.13 MiB`，已覆盖短项达标。[同哈希受控故障矩阵](./evidence/T09_FAULT_MATRIX_reset-inline-20261020.json)另经检查器复算，立即离线、天气超时、合成安全提醒各 3 次均进入预期页面，P95 分别 `613.08/1739.8/581.38 ms`，均低于 2 秒场景阈值。10 次内容准备全部为 `offline-rules`，在线首屏样本 `0`、短测 `gateSatisfied=false`；合成预警不等于真实网关。不同设备/DPI、读屏、生产联网与长稳仍缺，A9 **部分通过**。

2026-10-20 当前未签名、未安装内部 EXE `.work/redesign-rain-excerpt-20261019/release/weatherpoem.exe`，SHA-256 `402FE0C76ECFA256B396E02B4226E1E30E95716DC582D20F7263FDB9FA18EC16`，在强制 `weather-offline` 的隔离资料中完成[同哈希性能短测](./evidence/T09_PERFORMANCE_SMOKE_rain-excerpt-20261019.json)，并由 `node scripts/performance-smoke-check.mjs --candidate=rain-excerpt-20261019` 独立复算。10 次干净资料启动就绪 P95 **847.82 ms**，10 次已配置诗笺首帧 P95 **119.9 ms**，10 次离线准备 P95 **626.67 ms**；60 秒托盘空闲主进程 CPU 平均 **0%**、工作集 P95 **30.09 MiB**。已覆盖的短项通过，但在线首屏样本 **0**、报告 `gateSatisfied=false`；不证明真实在线天气、具名读屏、不同系统缩放、生产安全/撤回或长时稳定性。旧哈希 `5CC65F7E…` 的短测不能转签给当前候选，A9 继续**部分通过**。

2026-10-19 新规则 `1.2.5` 未签名、未安装内部 EXE `.work/redesign-rain-match-125-20261019/release/weatherpoem.exe`，SHA-256 `5CC65F7EC0CC20E44863C5581150BD4DF0DB49056E39E6D59C9081897C9579D0`，使用强制 `weather-offline` 隔离场景完成[同哈希性能短测](./evidence/T09_PERFORMANCE_SMOKE_rain-match-125-20261019.json)，并由 `node scripts/performance-smoke-check.mjs --candidate=rain-match-125-20261019` 独立复算：10 次干净资料启动就绪 P95 **650.52 ms**，10 次已配置诗笺首帧 P95 **140.2 ms**、离线准备 P95 **717.9 ms**；60 秒托盘空闲主进程 CPU 平均 **0%**、工作集 P95 **31.98 MiB**。内容准备 10/10 为 `offline-rules`，在线首屏样本 **0**、报告 `gateSatisfied=false`。这只证明新哈希的已覆盖离线短项，未触及真实用户资料，也不证明在线准备、具名读屏、系统缩放或长期稳定性；A9 继续**部分通过**。

2026-10-19 前一规则 `1.2.4` 未安装内部 EXE `.work/redesign-recommendation-124-20261019/release/weatherpoem.exe`，SHA-256 `3759CE59650FDB6681FA55BAD25542F3DA501D22B4832A40ECE3F4ED931712A4`，使用强制 `weather-offline` 隔离场景完成[同哈希性能短测](./evidence/T09_PERFORMANCE_SMOKE_recommendation-124-20261019.json)，并由 `node scripts/performance-smoke-check.mjs --candidate=recommendation-124-20261019` 独立复算有效：10 次干净资料启动就绪 P95 **615.82 ms**，10 次已配置诗笺首帧 P95 **146.8 ms**，10 次离线准备 P95 **667.63 ms**；60 秒托盘空闲主进程 CPU 平均 **0%**、工作集 P95 **29.93 MiB**。10 次内容准备全部为 `offline-rules`，在线样本 **0**、报告 `gateSatisfied=false`；运行只使用系统临时目录中的隔离资料，未修改真实用户资料。该报告只属于前一哈希，不构成新规则或 A9 完整通过，也不证明在线性能、读屏、不同系统缩放、多屏或长期稳定性。

2026-10-19 最新未安装内部 EXE `.work/redesign-toast-leave-20261019/release/weatherpoem.exe`，SHA-256 `4C2BE63A80D1D0622F9AFEB2084870EC8E4F18C500F862F43E97BA120C836DCC`。[同哈希隔离短测](./evidence/T09_PERFORMANCE_SMOKE_toast-leave-20261019.json)经独立检查器复算：10 次干净启动就绪 P95 **589.04 ms**，10 次诗笺首帧 P95 **122.5 ms**，10 次离线准备 P95 **1726.91 ms**；60 秒托盘空闲 CPU 平均 **0%**、工作集 P95 **30.54 MiB**。已覆盖短项达标，但 10 次内容准备均为离线，在线首屏样本 **0**、`gateSatisfied=false`；八小时/七天、不同设备缩放和读屏不能从旧哈希转移。提示连续过程的失败→修复报告见 T05，A9 保持部分通过。

2026-10-18 提示留位后的最终本批内部 EXE `.work/redesign-toast-fit-20261018/release/weatherpoem.exe`，SHA-256 `7BA3F65D56277E67A7B512A5A1E80A152AF397C2C3E6BAC736738004ACA3729C`，重新完成[同哈希短测](./evidence/T09_PERFORMANCE_SMOKE_toast-fit-20261018.json)并由 `performance-smoke-check` 独立复算：10 次干净启动就绪 P95 **597.79 ms**，10 次诗笺首帧 P95 **135.7 ms**，10 次离线准备 P95 **1765.42 ms**；60 秒托盘空闲 CPU 平均 **0%**、工作集 P95 **30.55 MiB**。已覆盖短项通过，但 10 次内容准备均为离线，在线首屏样本为 **0**、`gateSatisfied=false`。旧 `BF5…`、`BA9…` 的报告不能签给这一哈希；窗口提示布局的本机小窗图见 T05。八小时/七天、实际多设备缩放、读屏及长时窗口伸缩尚未完成，A9 **部分通过**。

2026-10-18 重新构建覆盖启动、首次设置与跨日续取的独立未签名内部 EXE `.work/redesign-weather-all-loads-20261018/release/weatherpoem.exe`，SHA-256 `BF5CCC3C7DF1D3B9DF41BC2AC4A5CFF702AE9651C295C16C8FD82D8F77B69FEC`。同哈希[性能短测](./evidence/T09_PERFORMANCE_SMOKE_weather-all-loads-20261018.json)经独立检查器复算：10 次干净启动就绪 P95 **621.8 ms**，10 次诗笺首帧 P95 **169 ms**，10 次离线准备 P95 **1767.96 ms**，托盘空闲 60 秒主进程 CPU 平均 **0%**、工作集 P95 **32.44 MiB**，已覆盖短项通过。10 次首屏均为 `offline-rules`，在线首屏 P95 **未测**，报告 `gateSatisfied=false`；八小时/七天、不同缩放和读屏仍不能转移旧候选结果。T01/T03 同哈希的原生画面另显示临时“天气已到”提示遮住底部继续读入口的一部分，这是短时交互质量待改项，不能把性能短测当作完整系统验收。A9 仍**部分通过**。

2026-10-15 就绪超时诊断准备：此前一次 15 秒内没有就绪标记，脚本报错后清理隔离资料，无法由原始报告判断失败样本、进程是否仍存活或当次候选哈希。现 `scripts/test-performance-smoke.ps1` 在进程先退出或 15 秒超时时，先写独立且不覆盖旧文件的 `*.failure-<runId>.json`，记录样本标签、原因、经过时间、PID/存活与退出码、标记是否存在及当前 EXE SHA-256；不复制隔离资料或用户数据，也不把失败写成性能通过。到截止点会再查一次标记，避免刚写入时误判。`scripts/performance-smoke-failure.ps1` 的合成超时、进程退出与重复写入拒绝已由 `performance-smoke-contract.test.mjs` 验证；本批未启动可见 WeatherPoem、未复现原生偶发失败，诊断记录尚不能解释根因，更不能签收 A9。下一次获准的隔离原生短测若再失败，应保留具名失败文件并据其继续定位，而不是仅重试到绿色。

## 本轮实际环境与改动

- 开发目录 `E:\weatherpoem`；`D:\纯净工作台` 尚未用于独立审计。Windows 11 10.0.26100、100% 逻辑缩放，隔离 profile 位于系统临时目录下；未改变真实用户资料或系统缩放。
- 原生运行暴露 `window.set_min_size not allowed`，导致原计划的小诗笺仍维持旧尺寸。为 `src-tauri/capabilities/default.json` 补齐窗口尺寸、可调整性、位置、显示器及缩放读取权限。Windows GNU 调试链接器在不需要的 `cdylib` 输出上报 `export ordinal too large: 113841`，桌面应用改为只生成 `rlib`。修复后调试 EXE 实际启动并按内容调整尺寸。
- `scripts/desktop-capability-contract.test.mjs` 新增精确权限回归检查，防止以后删去必需权限而只在原生窗口中暴露问题；仍不开放整个 `core:window:default` 权限集。
- 后续源码增加开机自启前台全屏探测：明确全屏或无法可靠探测时采用托盘保留，手动打开不受影响。Rust 几何和前端策略测试通过；真实演示/游戏、混合 DPI 和自动焦点仍未验，不能据此签 A4/A9。
- 本次仅由执行 AI 启动并结束隔离调试进程，旧发布候选没有重建、替换或终止。
- 使用独立 `CARGO_TARGET_DIR=E:\weatherpoem\.work\redesign-target` 进行无安装包的 release 构建；内部测试 EXE 为 `.work/redesign-target/release/weatherpoem.exe`，SHA-256 `D8E15744C17E4E26D116BAA23E7615AC3530D13E6989E33665B159A2D9A1D71A`。旧发行 EXE `00DB4B15F96E151CD7AF795A197E422F39ABFC3CE13E4AB298BF1DE7EC2DD74B`、旧发布清单 `5D4FAF610A9EB29F9833055A12B943F870410D5C62F9D17D8BEB3C25F29F619B`、旧 SHA 清单 `F745407E9DBEE18A087B220E2B468D8EB6FB68CBF7BF2096E7247EBB032E9A4B` 再次核对未变。新 EXE 不是 NSIS/MSI 发行候选。
- 性能脚本加入明确的 `-RedesignCandidate` 和 `-BaselineComparison` 两个隔离模式：前者测 `.work` 中新 EXE，后者只读运行旧 EXE；两份报告分别存于 `review/redesign/evidence/`，均不覆盖 `output` 的旧正式报告。校验器按每种模式的预期路径和当前文件哈希核对。
- 受控故障矩阵也增加 `--redesign-candidate` 隔离路径，新报告写入 `review/redesign/evidence/T09_FAULT_MATRIX.json`；立即离线、天气超时与合成预警分别至少采 3 次，原有默认旧候选脚本路径不变。

## 已执行的自动和原生检查

| 检查 | 实际结果 | 能证明的范围 |
| --- | --- | --- |
| `npm.cmd run lint`、`typecheck`、`build` | 通过 | 源码与前端构建，无原生发行证明。 |
| `npm.cmd run test` | 24 文件、129 项通过 | 功能和组件回归；不代表辅助技术实测。 |
| `cargo check --manifest-path src-tauri/Cargo.toml`、`cargo fmt --check` | 通过 | Rust 配置与代码检查。先前调试 watcher 同时占用 `libresource.a` 时一次失败，结束隔离 watcher 后重试通过；非源码故障。 |
| `cargo build --manifest-path src-tauri/Cargo.toml --no-default-features` | 通过 | 桌面调试链接可完成；不是 NSIS/MSI 发行包。 |
| `npm.cmd run accessibility:check` | 通过 | 自动焦点/语义/对比度/回流契约；工具明确提示讲述人、NVDA、真实对比度主题和 200% 系统测试未完成。 |
| `npm.cmd run device:matrix:check` | 通过 | 计划文件契约；不是设备矩阵实测。 |
| `npm.cmd run desktop:capability:check` | 6 项通过 | 确认原生尺寸 API 所需权限逐项列明，无宽泛窗口默认权限；不能代替真实窗口测试。 |
| 原生 WebView2：诗笺→全文→展开背景→返回；竖排→横排 | 样本《黄鹤楼》可达；诗笺约 404×513 缩至约 404×407；阅读窗约 560×720，八句顺序及来源出现在可访问树 | 仅 Windows 11 / 100% / 该作品 / 开发窗口的手动观察。桌面其他悬浮提示部分遮挡截图底部，不能把本次图像当作关键按钮完整可视证据。 |
| 新内部候选 10+10 次启动与 60 秒托盘短测 | **失败**：离线准备 P95 2342.04 ms，超过 2000 ms；干净启动 P95 1678.55 ms、诗笺首帧 P95 291.5 ms、托盘 CPU 0%、内存 P95 33.32 MiB 均在门槛内。在线样本未出现。 | 原始样本见 `review/redesign/evidence/T09_PERFORMANCE_SMOKE.json`；不能写成性能通过。 |
| 同机旧候选对照 10+10 次启动与 60 秒托盘短测 | **同样失败**：离线准备 P95 2229.43 ms，超过 2000 ms；旧版本轮首帧 P95 258.9 ms。 | 原始样本见 `review/redesign/evidence/T09_BASELINE_PERFORMANCE_SMOKE.json`。新版比同机旧版慢约 112.61 ms；不能据此把新版失败全部归因于代码，也不能用旧版 2026 年 9 月的通过报告抵销本轮失败。 |
| 新内部候选受控故障矩阵 | **部分通过**：立即离线 P95 1132.43 ms、合成预警 P95 1163.63 ms，最终视图/模式正确且低于 2000 ms；天气超时 P95 2162.97 ms，最终诗笺正确但超阈值。 | 原始逐次样本见 `review/redesign/evidence/T09_FAULT_MATRIX.json`。这些全是隔离合成场景，不证明真实官方预警。天气超时相对立即离线增加约 1030.54 ms，和当前 1100 ms 等待策略相符；这是由样本推断，不是完整性能剖析。 |

## 2026-10-13 第二轮：启动准备并行化与隔离重测

- 让天气请求在读取已配置城市后尽早开始，并与启动监听器、诗词目录导入并行；**天气等待仍为 1100 ms**，没有缩短超时或修改 2000 ms 门槛。预警仍在推荐诗笺之前判定，普通诗句不会在未知预警状态下抢先展示。首轮试验还把仓库创建与 Tauri 启动命令并行，因测试 EXE 未出现就绪记录，已撤销该项，只保留天气/目录的并行准备。
- 首个试验 EXE 曾用裸 `cargo build --release --no-default-features` 生成。诊断时其 WebView2 实际指向 `http://localhost:1420/` 开发地址；未启动开发服务器时无法产生就绪记录。这是**无效的发行测试构建**，不能作为产品启动回归或性能样本。随后使用项目的 `tauri build --no-bundle` 正确内嵌前端，且只构建隔离内部 EXE，不生成/替换 NSIS 或 MSI。此构建方法和结果不能被误称为 T10 发行验收。
- 新候选为 `.work/redesign-overlap-20261013/release/weatherpoem.exe`，SHA-256 `036E8FAD943554793DCDFF977B4E6FC99C86BB74C3C56B38296D6249701640D0`。报告为 `review/redesign/evidence/T09_FAULT_MATRIX_overlap-20261013.json` 与 `T09_PERFORMANCE_SMOKE_overlap-20261013.json`，两份检查器均按当前 EXE 哈希、样本和阈值复算通过。旧内部候选与旧 0.2.0 发布物哈希再次核对未变。
- 受控故障矩阵每场景 3 次：立即离线 P95 **890.64 ms**、天气超时 P95 **1808.29 ms**、合成官方预警 P95 **716.27 ms**；最终视图和安全优先状态均符合预期，全部低于各自 2000 ms 门槛。它仍不证明真实官方预警或在线天气。
- 新候选性能冒烟：10 次干净启动 P95 **725.13 ms**；10 次已配置离线准备 P95 **1820.71 ms**（≤2000）；诗笺首帧 P95 **154.9 ms**（≤300）；60 秒托盘 CPU 平均 **0%**、内存 P95 **29.34 MiB**。本轮在线样本没有出现，仍为未测，不能填入 ≤5000 ms 通过。新旧报告不是同一时刻的 A/B 对照，不能把改善幅度全部归因于一项源码改动。
- 同一哈希候选在隔离 Windows 11 / 100% 窗口实走《独坐敬亭山》：小诗笺的主句、理由、“继续读/收藏/收起/更多”可访问；点“继续读”后进入约 560×720 阅读窗，可看到全文、三处按需展开入口与来源；点“竖排阅读”后可访问文本仍按原句顺序给出；返回后小诗笺自适应增高，主要内容仍可见。观察仅覆盖这一首、这台设备和离线情境；桌面其他悬浮层遮住部分截图边缘，尚无可复用的无遮挡截图证据，不能据此签 A4–A6 或读屏通过。测试进程在核对后只按本次隔离 EXE 路径和 PID 结束，真实用户资料未触及。
- `npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd run test`（24 文件、131 项）、`npm.cmd run build` 及性能合同测试通过。新增具名隔离候选路径，保留第一轮报告与旧发布报告的原路径，不覆盖旧证据。

## 2026-10-13 第三轮内部候选与真实天气尝试

- 在加入隔离首次设置的系统自启动保护后，构建新的内部 EXE `.work/redesign-onboarding-20261013/release/weatherpoem.exe`，SHA-256 `89DE01D7FB403D2DB2F10484E50AF2C96FF970797EDDAF20415D03994E28930A`。此前 `overlap-20261013` 的性能报告不适用于该哈希。
- 用具名隔离候选执行真实天气条件下的性能短测。首次运行在 WebView2 临时文件清理时遇锁，清理异常遮住原测试结果，**没有有效报告**；修正脚本为校验过的临时目录做有界重试，并在最后失败时仅警告，不覆盖原测试异常。第二次运行暴露原问题：“15 秒内未产生就绪标记”，没有有效报告；为每个样本加入标签，以便后续定位。第三次运行生成并通过 `review/redesign/evidence/T09_PERFORMANCE_SMOKE_onboarding-20261013.json`，哈希与统计由具名检查器复算通过。这两次失败不能被第三次通过抹去，间歇性无就绪标记仍需追查。
- 第三次的已覆盖结果：10 次冷启动 P95 **688.24 ms**（≤2,000）；10 次已配置诗笺准备 P95 **1927.56 ms**（≤2,000）；诗笺首帧 P95 **281 ms**（≤300）；60 秒托盘空闲主进程平均 CPU **0%**、内存 P95 **29.19 MiB**。10 次准备全部是 `offline-rules`，真实在线天气样本 **0**，不得填写在线准备通过。报告的 `result` 是 `automated-smoke-passed`，但 `gateSatisfied=false`，表示完整门禁仍未满足。
- 因真实天气全数降级，未出现可观察的鲜活晴/雨/雪动态诗境；不能用这组托盘空闲样本证明 T07 的动效开/关 60 秒资源差。应先有合法的隔离情境或真实新鲜天气，再比较**可见的同一诗境**，并计入 WebView2 渲染进程，不能只看主进程。

## A9 验收逐项状态

| 条件 | 当前结论 | 缺少的证据或下一步 |
| --- | --- | --- |
| Tab/方向键/Enter/空格/返回与焦点可见 | **未测全路径** | 在新安装候选上从首次设置完整键盘走查。 |
| 讲述人/NVDA 实际读序与对比度主题 | **未测** | 具名人员按 `docs/ACCESSIBILITY.md` 留独立记录；可访问树不能替代发声和视觉实测。 |
| Windows 10/11、100/125/150/200%、低屏高、混合 DPI 多屏 | **仅 Windows 11 / 100% 一个样本** | 用专用设备或账户按 `docs/DEVICE_MATRIX.md` 补全部组合；不得修改真实用户显示设置作为自动化耗材。 |
| 离线、超时、预警、内容撤回故障矩阵 | **第二轮哈希的隔离自动矩阵通过三项；最新第三轮哈希未重测** | 第二轮立即离线、受控天气超时和合成预警达标；不得跨哈希套用到第三轮，真实端点/真实预警及撤回 E2E 仍未测。 |
| 冷启动、首帧、在线/离线准备、托盘 CPU/内存 | **最新内部候选的已覆盖短测通过，在线未测；存在间歇性无就绪标记** | 最新哈希的离线准备 P95 1927.56 ms、首帧 P95 281 ms 和空闲资源达标；在线准备未出现，第二次重测的就绪超时需定位，不能宣称该子项稳定通过。 |
| 动效开/关同设备 60 秒对照 | **未测** | 保留 CPU 和工作集样本、录屏节奏及卡顿观察。 |
| 浅/深、横/竖、长/短、节日/天气/安全视觉矩阵 | **部分** | 已看未知天气的浅色横竖样本；其余按 T05–T07 记录补齐。 |

因此 A9 **仍不得签为整体通过**。A4–A8 也保持各自的部分通过状态。T10 正式发行构建尚不能启动；新 EXE 仅供隔离调试。下一步补真实在线天气、真实预警/撤回、键盘/读屏、各缩放与混合 DPI、动效对照；若后续源码或环境变化，需用相应新候选重测，而非沿用此哈希的通过报告。在上述门禁齐备前不得把本分支标成发布完成。

2026-10-14 自动可访问性增量：T07 静态诗境矩阵后，`accessibility:check` 新增装饰颜色最大叠加量下的浅/深主题 `ink`、`muted`、`faint`、`accent` 对比度。新门槛先发现浅色次要字 4.17:1、深色淡字 4.03:1；颜色小幅修正后最小值为深色强调字 **4.73:1**，各项超过 4.5:1，自动基线版本更新为 `2026.10-accessibility-v2`。同一源码的浏览器天气矩阵 14/14 与旧 T05 节日/安全矩阵 10/10 完整退出码 0，证据见 T07；此处仅补 CSS 静态计算和隔离浏览器，不把实际 WebView2、系统对比度主题、讲述人/NVDA 或 200% 缩放改为通过。A9 仍为**部分通过**，旧内部 EXE 的性能报告不能证明当前颜色版本。

## 2026-10-15 当前源码内部候选的短时性能复核

动效停机修复后的内部 EXE `.work/redesign-motion-stop-20261015/release/weatherpoem.exe`，SHA-256 `0C6D96DF719366F9068D435D0277C2E7BC0ED72B23634143F88396BF695DF76B`，在未安装、独立临时资料下完成[当前哈希性能冒烟报告](./evidence/T09_PERFORMANCE_SMOKE_motion-stop-20261015.json)，独立检查器复算通过。10 次冷启动观察就绪 P95 `646.58 ms`（目标 ≤2,000），10 次已配置诗笺首帧 P95 `142.2 ms`（目标 ≤300），10 次降级准备 P95 `1,803.9 ms`（目标 ≤2,000）；60 秒关闭到托盘的主进程平均 CPU `0%`、工作集 P95 `30.01 MiB`（目标 <0.2% / <100 MiB）。所有天气准备都是 `offline-rules`，在线样本为 0，不能填写在线准备通过。T07 同哈希的可见雨景静／动资源差见 T07 记录；这是合并主进程＋WebView2 的另一组测量，不与本段托盘主进程数值混用。

上文 2026-10-13 表格为当时快照，不能继续称动效对照“未测”，也不能把本段单次短测当成整体验收。当前仍缺 Windows 10、真实缩放/多屏、具名读屏、真实在线天气与预警／撤回、休眠恢复和正式新发行候选；`gateSatisfied` 仍受未测条件约束，A9 保持**部分通过**。

2026-10-16 依赖安全重扫发现旧 npm 锁文件的 5 项漏洞记录；在现有版本范围更新后 npm/OSV、原生 Cargo 审计和许可/NOTICE 草案检查均已通过，当前 npm 与 Windows 目标 Rust 已知安全漏洞为 0。但 Vue 等依赖版本已变，前述 `0C6D…` 内部 EXE 是更新前构建，不能证明新锁文件下的原生性能。更新后 266/266 前端测试、lint、类型检查和 Web 构建通过。汇总检查在电池供电主机上先发现七天长测预检测试错误地要求交流电在线；改为验收实际供电状态及不写证据后，`performance:check` 通过，完整 `check` 仍停在过期且未获批准的四周试点计划。没有启动七天长测、修改电源设置或更新旧候选的性能报告；A9 仍**部分通过**。

同日已应用稳定 Tauri 2.12.4，并在隔离内部候选上修复最小化后 WebView2 仍报告页面可见而误启诗境动效的问题。最终本轮测试 EXE 为 `.work/redesign-tauri-212-minimize-fix-20261016/release/weatherpoem.exe`，SHA-256 `DB56F155495900B11E73CCFABCC4D99BFFC24F233AEBD0127772639811DD391D`，未签名、未安装、不是发行候选。[同哈希性能短测](./evidence/T09_PERFORMANCE_SMOKE_tauri-212-minimize-fix-20261016.json)经独立检查器复算：10 次冷启动就绪 P95 **756.82 ms**、10 次诗笺首帧 P95 **240.4 ms**、10 次离线降级准备 P95 **1,952.09 ms**，均低于已覆盖的 2,000/300/2,000 ms 门槛；托盘空闲 60 秒主进程 CPU 平均 **0%**、工作集 P95 **32.58 MiB**。10 次内容准备全部是 `offline-rules`，在线天气准备为 **0 次**；该报告 `gateSatisfied=false`，八小时与七天长期门禁没有转移到新哈希。原生最小化/隐藏稳态与系统减少动态检查见 T07；T04 的本轮两次窗口测试分别发生抢焦点和托盘 UI Automation 图标屏外失败，均未抹去。A9 仍**部分通过**，不得以短测签收完整系统或发布门禁。

2026-10-17 自动显示焦点修正后的新内部 EXE `.work/redesign-tauri-noactivate-experiment-20261017/release/weatherpoem.exe`，SHA-256 `0921010061A8D66C551DEAC609B74063433C88B07D836B321F4EAECAF401D4AD`，完成[同哈希隔离性能短测](./evidence/T09_PERFORMANCE_SMOKE_tauri-noactivate-experiment-20261017.json)并由独立检查器复算通过：10 次冷启动就绪 P95 **585.61 ms**，10 次诗笺首帧 P95 **139.7 ms**，10 次离线降级准备 P95 **1,780.25 ms**；60 秒托盘空闲主进程 CPU 平均 **0%**、工作集 P95 **32.39 MiB**。前台焦点、托盘与最小化同哈希检查见 T04/T07。在线天气样本仍为 0，八小时/七天、真实设备及具名质量签收没有补齐；报告 `gateSatisfied=false`，EXE 未签名、未安装，A9 继续**部分通过**。

2026-10-18 当前收藏修复内部 EXE `.work/redesign-favorite-save-20261018/release/weatherpoem.exe`，SHA-256 `9E96FA84DCCA99F7C24D1616FDF1609547A9CFDF4EA323C0DE8F7E807F4CF4F4`，完成[同哈希隔离性能短测](./evidence/T09_PERFORMANCE_SMOKE_favorite-save-20261018.json)并经 `node scripts/performance-smoke-check.mjs --candidate=favorite-save-20261018` 独立复算：10 次干净资料启动就绪 P95 **676.27 ms**、10 次诗笺首帧 P95 **124.9 ms**、10 次离线准备 P95 **1,748.18 ms**、60 秒托盘空闲主进程 CPU 平均 **0%**、工作集 P95 **30.52 MiB**，已测短项达标。10 次内容准备均为 `offline-rules`，在线准备为 **0 个样本**，`gateSatisfied=false`。这是未签名、未安装的内部候选；八小时/七天与旧哈希报告不能转移。

为区分“本机断网”与程序启动天气路径问题，又在同一 EXE 的独立临时资料和原生 WebView2 中运行 `scripts/diagnose-native-weather.mjs`，保留[启动后诊断](./evidence/T09_NATIVE_WEATHER_DIAGNOSTIC_favorite-save-20261018.json)与[启动瞬间网络事件](./evidence/T09_NATIVE_WEATHER_STARTUP_TRACE_favorite-save-20261018.json)。两次启动仍为 `offline-rules`；第二次在就绪前捕获 Open-Meteo 请求，发起后约 **1,107 ms** 被 `net::ERR_ABORTED` 取消，与源码 1100 ms 的取消定时器相符。随后同一 WebView2 从相同 URL 两次取得 HTTP 200、必要字段齐全，分别耗时 **770 ms**（1100 ms 截止）和 **312 ms**（5000 ms 截止）；第一次独立诊断的后续请求为 **547/317 ms**。宿主机同 URL 五次命令行请求均为 HTTP 200，但总耗时约 **0.84–1.96 秒**。这已证明**至少此次启动**不是服务永久不可达，而是应用主动取消了仍未返回的请求；不能从一次网络跟踪外推全部 10 次短测的逐次根因。下一步需要在保持离线 ≤2 秒、在线 ≤5 秒、预警优先且不闪换旧诗的条件下设计后台续取/展示状态，再用新候选同时重测在线与离线。不能只延长 1100 ms 等待并牺牲离线门槛，也不能把后续成功请求冒充启动在线样本。A9 仍**部分通过**。

2026-10-18 在新隔离目录构建未安装内部 EXE `.work/redesign-weather-late-20261018/release/weatherpoem.exe`，SHA-256 `4C378084D24E8C2D4C52B5B6DE717D9AA628A6FF9CD6E5F1773387A12D3E2D53`，没有覆盖旧候选。新策略保留首屏 1100 ms 天气等待；只对被首屏定时器取消的请求再作一次最多 5000 ms 的后台续取。原生[联网观察报告](./evidence/T09_NATIVE_LATE_WEATHER_weather-late-20261018.json)显示首请求在约 1106 ms 被取消，续取获 HTTP 200；就绪标记仍为 `offline-rules`，重阳节《过故人庄》先出现，随后环境栏从“天气未更新”变成“晴”，原诗未闪换。已逐张查看[就绪诗笺](./evidence/T09_NATIVE_LATE_WEATHER_weather-late-20261018_ready.png)与[天气到达后](./evidence/T09_NATIVE_LATE_WEATHER_weather-late-20261018_after.png)：文字、主句和按钮可读，界面未横向拥挤。节日优先当天不应因普通晴天重选；非节日小雨重新选诗目前只由 App 测试证明。

[同哈希隔离短测](./evidence/T09_PERFORMANCE_SMOKE_weather-late-20261018.json)经 `node scripts/performance-smoke-check.mjs --candidate=weather-late-20261018` 复算：10 次干净资料启动就绪 P95 **600.69 ms**、10 次诗笺首帧 P95 **118.4 ms**、10 次离线准备 P95 **1,702.49 ms**；60 秒托盘空闲主进程 CPU 平均 **0%**、工作集 P95 **30.56 MiB**，已测短项达标。10 次首屏仍全部是 `offline-rules`，没有首次就绪即在线的样本，在线准备 P95 **未测**，报告 `gateSatisfied=false`。晚到成功不伪装成首屏在线通过；八小时/七天、不同机器、缩放和真实读屏也未由旧哈希转移。A9 继续**部分通过**。

2026-10-19 窗口大小启动修正后的未安装 EXE `.work/redesign-glance-startup-fix-20261019/release/weatherpoem.exe`，SHA-256 `3D3856613786D6961B6BE7ECF5274F8E017DE79E1AB8CAA541F8B498A4B0ED10`，完成[同哈希隔离性能短测](./evidence/T09_PERFORMANCE_SMOKE_glance-startup-fix-20261019.json)，独立检查器 `node scripts/performance-smoke-check.mjs --candidate=glance-startup-fix-20261019` 通过。10 次干净资料启动就绪 P95 **605.68 ms**，10 次离线诗笺首帧 P95 **142.4 ms**、离线准备 P95 **1,860.75 ms**；60 秒托盘空闲主进程 CPU 平均 **0%**、工作集 P95 **30.55 MiB**，已测短项达标。10 次已配置首屏均为 `offline-rules`，首次就绪在线样本仍为 0，报告 `gateSatisfied=false`。当前会话曾锁屏，焦点脚本前提失败，不能把这份短测当作自动弹窗不抢焦点证据；真实在线、读屏、多 DPI、长期与发布门禁均未由旧哈希转移。A9 继续**部分通过**。

## 2026-10-20 真实天气晚到后的已读诗笺保持检查

当前未安装内部 EXE `.work/redesign-reset-inline-20261020/release/weatherpoem.exe`，SHA-256 `D68E286A2C5F2262079078921804134917CBB8C6836E1AB2D8036307E8F1325B`，此前[自然续取诊断](./evidence/T09_NATIVE_LIVE_WEATHER_NATURAL_RESETINLINE_20261020.json)已经证明在未碰诗笺时，晚到的小雨会触发自然重选，但未覆盖用户开始阅读后的低打扰行为。本次采用单独临时资料，以 WebView2 原生指针输入点在诗题，随后不代替应用发天气请求，等待应用自然续取；[结构化报告](./evidence/T09_NATIVE_LIVE_WEATHER_TOUCHED_RESETINLINE_20261020.json)和[末态截图](./evidence/T09_NATIVE_LIVE_WEATHER_TOUCHED_RESETINLINE_20261020_after.png)保留结果。

就绪标记为 `offline-rules`；点诗前后均显示《暮江吟》，实际 `pointerdown` 命中诗笺一次。八秒后本机北京 Open-Meteo 缓存来源为 `open-meteo`，天气栏从“天气未更新”更新为“小雨”，诗题仍为《暮江吟》，无加载/安全遮挡；隔离 SQLite 当日状态和唯一一条展示事件均指向该诗。`node scripts/redesign-live-weather-touch-check.mjs T09_NATIVE_LIVE_WEATHER_TOUCHED_RESETINLINE_20261020.json` 独立复算 EXE／脚本哈希、指针命中、UI 状态、数据库与 PNG 文件通过。原生截图已检查主句、理由与操作没有被天气栏遮挡。没有修改真实资料、时钟、启动项、显示设置，也没有安装/卸载。

这只证明单一日期、城市、机器和自然网络时序下的“已读诗不闪换”，不代表人工长期使用、弱网分布、真实预警/读屏或在线首屏 P95。旧候选的离线短测数值不因本次诊断改写；A1/A9 仍**部分通过**。首个天气资源被 1100 ms 限制取消的观测不足以决定新超时，应先用独立新候选 A/B 重测在线和离线，而非仅根据 1116–1121 ms 两个边界样本上调。
