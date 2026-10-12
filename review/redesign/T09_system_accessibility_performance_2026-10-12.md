# T09 真机可访问性与资源表现阶段记录

状态：**部分通过，性能短测有明确失败／系统矩阵尚未验收**。本记录只属于 `redesign/phase-1` 源码、隔离的 Windows 开发窗口及新建的内部测试 EXE，不把旧 0.2.0 EXE 的性能或设备报告当作新版通过证据。

## 本轮实际环境与改动

- 开发目录 `E:\weatherpoem`；`D:\纯净工作台` 尚未用于独立审计。Windows 11 10.0.26100、100% 逻辑缩放，隔离 profile 位于系统临时目录下；未改变真实用户资料或系统缩放。
- 原生运行暴露 `window.set_min_size not allowed`，导致原计划的小诗笺仍维持旧尺寸。为 `src-tauri/capabilities/default.json` 补齐窗口尺寸、可调整性、位置、显示器及缩放读取权限。Windows GNU 调试链接器在不需要的 `cdylib` 输出上报 `export ordinal too large: 113841`，桌面应用改为只生成 `rlib`。修复后调试 EXE 实际启动并按内容调整尺寸。
- `scripts/desktop-capability-contract.test.mjs` 新增精确权限回归检查，防止以后删去必需权限而只在原生窗口中暴露问题；仍不开放整个 `core:window:default` 权限集。
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

## A9 验收逐项状态

| 条件 | 当前结论 | 缺少的证据或下一步 |
| --- | --- | --- |
| Tab/方向键/Enter/空格/返回与焦点可见 | **未测全路径** | 在新安装候选上从首次设置完整键盘走查。 |
| 讲述人/NVDA 实际读序与对比度主题 | **未测** | 具名人员按 `docs/ACCESSIBILITY.md` 留独立记录；可访问树不能替代发声和视觉实测。 |
| Windows 10/11、100/125/150/200%、低屏高、混合 DPI 多屏 | **仅 Windows 11 / 100% 一个样本** | 用专用设备或账户按 `docs/DEVICE_MATRIX.md` 补全部组合；不得修改真实用户显示设置作为自动化耗材。 |
| 离线、超时、预警、内容撤回故障矩阵 | **隔离自动矩阵部分通过** | 立即离线和合成预警达标；天气超时未达标；真实端点/真实预警及撤回 E2E 仍未测。 |
| 冷启动、首帧、在线/离线准备、托盘 CPU/内存 | **内部 EXE 短测失败** | 离线准备 P95 2342.04 ms > 2000 ms；其余本轮已出现的子指标达标，在线准备未测。先诊断环境与初始化耗时，再用同一新候选重测；不能调高门槛或用旧报告代替。 |
| 动效开/关同设备 60 秒对照 | **未测** | 保留 CPU 和工作集样本、录屏节奏及卡顿观察。 |
| 浅/深、横/竖、长/短、节日/天气/安全视觉矩阵 | **部分** | 已看未知天气的浅色横竖样本；其余按 T05–T07 记录补齐。 |

因此 A9 **不得签为通过**。A4–A8 也保持各自的部分通过状态。当前 T10 发行构建尚不能启动；内部 EXE 仅供调试。下一步需在天气可靠性与 2000 ms 首次准备目标之间做有依据的性能设计，不应仅为跑绿而无说明地缩短 1100 ms 天气等待或放宽阈值；同时继续补系统矩阵。在上述门禁齐备前不得把本分支标成发布完成。
