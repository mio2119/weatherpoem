# WeatherPoem MVP 实施与验收状态

更新时间：2026-08-05  
当前阶段：M1 离线核心闭环完成，M2 数量与覆盖门槛完成，M3 部分能力已进入工程

项目就绪结论：内部试用 7/7 门禁通过；校园试点 7/18、公开发布 7/24，
均未就绪。逐项状态见 `docs/PROJECT_READINESS.md`。

### 重要事件的阶段边界

重要事件专题不属于当前 MVP，也不属于当前四周校园试点候选。当前发布物不抓取实时新闻、不自动判断热点，也不把未来规格作为当前功能。

试点后若进入 `1.2 Curated Context`，只允许具名编辑和不同的具名审核人共同批准、带有效期和撤回条件的少量专题。AI 不读取原始新闻；主卡片仍只展示一首诗；严重天气和公共安全抑制优先。自动检查不得把未来规格当作当前实现或当前验收证据。

## 已通过

| 需求 | 当前证据 |
| --- | --- |
| Windows 桌面工程 | Tauri 2 + Vue 3 + TypeScript Release 编译通过 |
| 首次设置 | 城市、开机启动、隐私说明可完成，无需账号 |
| 每日触发 | 区分手动启动与 `--autostart`；同日已处理时开机启动保持托盘静默 |
| 推荐优先级 | 节日 +50、天气 +20、节气 +10，并有近期重复、作者和反馈惩罚 |
| 语境冲突 | 非节日日期抑制节日专属作品；浏览器实测修复“非端午日推荐《端午》” |
| 安全暂停 | 雷暴、强风、强降水基础代理在推荐前阻断普通诗笺 |
| 官方预警适配 | 可配置 HTTPS 网关；城市、来源、地区、发布时间、失效时间与等级校验；只发送城市标识 |
| 离线降级 | 天气六小时缓存；完全失败时使用本地节日、节气、季节和内容包 |
| AI 理由 | 独立网关；严格 JSON Schema；限流缓存；2.5 秒降级；47 场景自动评测、三轮无缓存运行器与具名人工评分契约 |
| 内容发布门禁 | 120 首发布内容；工程状态门禁；具名双人专家审核工作簿；底本证据、五项结论、只读事实锁定与 CSV 回收校验 |
| 内容场景覆盖 | 八个传统节日、二十四节气、四季、四时段与 12 类可识别天气均有候选 |
| 低打扰界面 | 430×680 实测：首页只显示题名、作者、两句、理由；详情按需展开 |
| 托盘与单实例 | 托盘重开、设置、退出；关闭窗口隐藏到托盘；第二实例唤醒主窗口 |
| 本地数据 | Tauri SQLite；浏览器调试自动降级 localStorage |
| 用户反馈 | 收藏、收藏列表、不贴合、每天换一首一次 |
| 可访问偏好 | 深浅主题、跟随系统、减少动态效果、键盘可达基础语义 |
| 发布物 | Release EXE、NSIS 安装包、MSI 安装包均已生成；当前明确为未签名 M1 内部试用版 |
| 发布可信状态 | 应用内显示版本与试用标识；发布门禁复核 SHA-256、Authenticode、证书/时间戳状态和发布清单，正式渠道不能由试用包冒充 |

## 自动验证

工作台任务：

```powershell
cd D:\纯净工作台
.\cw.ps1 run weatherpoem-verify
```

最近一次隔离复验日志：
`D:\纯净工作台\.workbench\artifacts\task-runs\1784850265-weatherpoem-verify.log`。

最近结果：

- ESLint：通过
- Vue/TypeScript 类型检查：通过
- Vitest：16 个测试文件、80 项测试通过（含自启四态同步、个人数据清除、内容撤回、试点隐私聚合、会话正常退出/异常恢复、天气许可白名单与 NOTICE 固定打开命令、无障碍初始焦点、天气降级预算与三类受控场景）
- 内容专家审核契约：5 项 CSV、只读内容、双人复核与结论测试通过
- 内容撤回：远端清单校验、离线缓存、修订防回退、候选排除、当日校正和全局暂停通过；3 项报告防冒充契约通过
- 桌面权限：SQLite 加载/查询/关闭与参数化写入可用；Shell、任意文件系统、进程、通用 HTTP 和全局快捷键均未开放；3 项权限/隔离/场景注入契约通过
- 性能证据：绑定当前 EXE SHA-256
  `D388D9484A7B81B1039CFAA1D21CBAD178750E5375B8FBCA7D8334A8C681609A`
  的正式八小时长测已完成 480/480 次采样，launcher 与应用进程自然退出，
  `npm run performance:eight-hour:check` 正式门禁通过。当前短性能烟测、三类受控
  故障矩阵和两分钟演练已在受控空闲环境重新生成并通过
  `npm run performance:check`；真实在线/预警、七天、休眠唤醒、内容更新、事件
  积压和具名签署仍未完成
- 校园试点候选：28 天本地按日聚合、无标识/无时间戳会话与异常中断计数、
  三项单独确认、人工摘要、托盘正常退出握手、退出即删和第 35 天起下次启动清除
  通过；计划防冒充契约通过，真实隐私批准与冻结候选真机验证仍未完成
- 范围冻结：0.2.0/2026.07.1 安全默认提案已明确内部受控分发、本地规则 AI、
  付费预算 0、预警待授权和本地聚合；3 项防冒充契约通过，七个真实责任人与
  Go/No-Go 仍待发起人批准
- 非开发人员 UAT：计划已绑定 portable、NSIS、MSI 三项当前哈希，覆盖两名
  非开发者和 11 个安装/使用/卸载场景；3 项防冒充契约通过，真实执行、P0/P1
  汇总和质量/试点签署仍待完成
- Node AI 理由网关：19 项契约、结构化输出、安全、评测与服务启动测试通过
- 依赖审计：npm 268 个依赖和 Windows 目标 286 个 crates.io 包经 npm、OSV 与原生 RustSec 扫描，目标内漏洞和 unsound/yanked 阻断警告均为 0；5 项 `unic-*` 停止维护公告保留待评审；原始锁文件中的非 Windows `rsa`、GTK3/GLib 发现完整保留并由目标依赖树契约排除
- 依赖处置：5 项 `unic-*` 已归并为同一 Tauri→urlpattern 链；上游 PR #15660
  已合并且 `urlpattern 0.6` 移除该链，但尚未进入稳定 Tauri；下一稳定版升级与
  2026-08-31 复核期限草案通过 3 项防冒充契约，仍需具名批准
- 内容/资产许可：机器台账已绑定 120 首底本字段、现代解释、全部图标、系统字体
  回退策略、Open-Meteo/OpenAI/预警服务，以及锁文件中的 268 个 npm 和 286 个
  Windows Rust 第三方包；设置页已显示 Open-Meteo/CC BY 4.0 署名、许可链接与
  字段选择/天气代码映射/缓存说明，链接权限限定到官方许可页；3 项契约拒绝删除
  署名、把公版候选或虚构法务批准冒充为授权，RQT-23 保持 `partial`
- 第三方 NOTICE：从当前安装依赖、经哈希核验的上游来源及固定 SPDX 规范来源
  收集并去重得到 300 份许可/NOTICE 文本。上游可验证文本仍覆盖 259/268 个 npm
  包和 284/286 个 Windows Rust 包；9 + 2 个上游发布物缺口如实保留。分发侧用
  SPDX v3.28.0 固定提交中的五份规范文本补充 11 个显式例外，分发可读许可文本
  覆盖达到 268/268 与 286/286；已验证 37 个同版同仓库包映射、5 个 npm 原始
  发行包文本、1 个 npm gitHead 仓库文本、9 个 crate VCS 提交仓库文本和 5 个
  固定 SPDX 规范文本。规范补充不冒充上游随包文件，也不代表许可证兼容性或法务
  批准。当前 NSIS 真实安装目录中的
  `licenses/THIRD_PARTY_NOTICES.md` 已通过严格 UTF-8、非空和与源 NOTICE
  逐字节一致性校验；MSI 行政镜像及载荷哈希已通过，但管理员 MSI 真实安装、
  修复、卸载和安装后 NOTICE 校验仍待完成。因此聚合
  `WeatherPoem_0.2.0_INSTALLED_NOTICE.json` 保持 `partial`，人工 Windows 和
  production 门禁尚未通过。机器证据也不代表许可证完整或具名法务批准
- 签名更新：Tauri v2 安全实施计划已绑定当前试用候选，覆盖公私钥隔离、HTTPS
  元数据、更新包签名与 Authenticode 双门禁、前向修复回滚、公钥轮换和 12 个
  正反场景；3 项契约拒绝虚构密钥、端点、执行或批准，RQT-20 保持 `partial`
- 公开分发：演练计划已绑定 portable、NSIS、MSI 当前哈希，覆盖不可变上传、
  独立重下、TLS/重定向、签名/哈希、内容在线/离线撤回、二进制撤回和前向修复
  10 个场景；3 项契约拒绝虚构托管、执行或批准，RQT-21 保持 `partial`
- Windows 代码签名：组织取得与执行计划已绑定三项当前 NotSigned 发布物，覆盖
  发布主体、证书/服务、私钥与工作台隔离、时间戳、允许列表、签名后清单和
  10 个正反场景；3 项契约拒绝虚构证书、私钥能力或签名完成，RQT-19 保持
  `partial`
- 四周校园试点：执行包已绑定当前候选，固定 30—50 名 18+ 大学生、28 天、
  六阶段和九项产品成功标准；3 项契约拒绝修改门槛、掩盖崩溃会话测量缺口或
  虚构参与者/Go-No-Go，RQT-22 保持 `partial`
- Vite 生产构建：通过
- Cargo fmt：通过
- Cargo check：通过
- NSIS/MSI 文件门禁：通过
- NSIS 真实生命周期：临时静默安装、启动 6 秒、NOTICE 逐字节校验、静默卸载及程序文件/注册项/快捷方式/自启残留检查通过；用户内容数据未删除
- MSI administrative image：解包、载荷启动 6 秒、临时清理与无系统注册残留通过；真实管理员安装/修复/卸载未测试
- 关闭到托盘与单实例：关闭后原进程保留，第二进程退出且唤醒原窗口
- 原生窗口定位：96 DPI 逻辑工作区右侧/底部均为 22px，窗口不越界；2 个物理面板当前只形成 1 个逻辑显示区
- Windows 发布可信与人工证据契约：23 项测试通过；3 个当前发布物均明确检测为 `NotSigned`
- 管理员 MSI 与真实重启自启：证据脚本、跨重启状态机和哈希门禁已就绪；尚未执行，不计为通过
- NSIS 升级与人工回滚：`0.1.0` 基线、只读预检、数据保护和证据门禁已就绪；当前账号有真实应用数据而被安全拒绝，尚未在专用账号执行
- 需求—证据追踪：24 项门禁、3 个里程碑和 6 项防冒充契约通过；只能声明 `internal-trial-ready-only`
- Release 二进制启动 6 秒未退出：通过
- 纯净工作台项目审计：控制面与源码目录保持隔离，以绝对路径
  `E:\weatherpoem` 复核为 92/100，strong；审计产物保存在工作台而非项目源码中
- 工作台浏览器断言：通过，无控制台错误
- 430×680 交互走查：首次设置、诗笺、阅读、设置、预警、收藏列表通过
- 430×680 / 390×620 浏览器布局矩阵：两种视口、8 个场景均无横向溢出和控制台错误

## 发布物

- `src-tauri/target/release/weatherpoem.exe`
- `src-tauri/target/release/bundle/nsis/WeatherPoem_0.2.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/WeatherPoem_0.2.0_x64_en-US.msi`
- `output/WeatherPoem_0.2.0_SHA256.txt`
- `output/WeatherPoem_0.2.0_RELEASE.json`
- `output/WeatherPoem_0.2.0_NSIS_LIFECYCLE.json`
- `output/WeatherPoem_0.2.0_MSI_IMAGE.json`
- `output/WeatherPoem_0.2.0_SINGLE_INSTANCE.json`
- `output/WeatherPoem_0.2.0_WINDOW_POSITION.json`
- `output/WeatherPoem_0.2.0_READINESS.json`
- `output/WeatherPoem_0.2.0_DEPENDENCY_AUDIT.json`
- `output/WeatherPoem_0.2.0_CARGO_AUDIT.json`
- `output/WeatherPoem_0.2.0_DEPENDENCY_RISK_REVIEW.json`
- `review/content-asset-license-inventory.json`
- `review/third-party-notice-index.json`
- `docs/THIRD_PARTY_NOTICES.md`
- `review/signed-updater-plan.json`
- `review/public-distribution-rehearsal-plan.json`
- `review/windows-code-signing-plan.json`
- `review/four-week-pilot-execution-plan.json`
- `output/WeatherPoem_0.2.0_CONTENT_WITHDRAWAL_DRILL.json`
- `output/WeatherPoem_0.2.0_PERFORMANCE_SMOKE.json`
- `output/WeatherPoem_0.2.0_PERFORMANCE_FAULT_MATRIX.json`
- `output/WeatherPoem_0.2.0_PERFORMANCE_LONG_RUN_REHEARSAL.json`

管理员测试完成后才会新增以下证据，当前不存在不代表自动化失败，也不能被记录为
已经通过：

- `output/WeatherPoem_0.2.0_MSI_ELEVATED_LIFECYCLE.json`
- `output/WeatherPoem_0.2.0_AUTOSTART_REBOOT.json`
- `output/WeatherPoem_0.2.0_NSIS_UPGRADE_ROLLBACK.json`

## 尚未达到正式公开发布

以下项目不影响 M1 本地试用，但在真实校园试点或公开发布前仍需完成：

机器可读的权威状态为 `review/requirements-traceability.json`，当前校园试点的
11 个阻断项和公开发布新增条件见 `docs/PROJECT_READINESS.md`。以下说明保留为
人类可读摘要：

1. 120 首数量与场景覆盖已达到 M2 工程门槛，具名双人审核工作簿和机器回收门禁已经生成；仍需真实审核人与复核人按权威点校本逐首填写并回传。当前 `sourceVerified` 仅代表来源字段初核。
2. 客户端预警网关契约与适配器已经完成；仍需由项目方采购或取得合法数据授权、部署正式 HTTPS 网关、将唯一源加入 CSP，并完成撤销与弱网测试。
3. AI 理由服务端、Dockerfile、47 场景评测集、时延汇总和人工评分门禁已完成；当前开发机未安装 Docker，因此容器镜像构建仍需在部署环境验证。之后还需设置服务端 API 密钥、部署正式 HTTPS 实例、收窄 CSP，并对候选实例完成三轮真实质量、时延、token/账单预算与故障评测。未配置时始终使用本地规则理由。
4. 未签名试用版标识、SHA-256、Authenticode 检查和正式发布阻断门禁已完成；
   当前安装包仍未取得项目主体的代码签名证书，不能公开发行。自动更新尚未接入，
   且未来必须同时具备独立 updater 包签名和 Windows Authenticode，详见
   `docs/WINDOWS_RELEASE_TRUST.md`。
5. 浏览器逻辑窗口矩阵和本机 Windows 11/100%/单逻辑显示区的原生定位
   已记录；WMI 探测到的 2 个物理面板当前未组成扩展桌面，不能替代跨屏和
   系统 DPI 矩阵。正式发布仍需按
   `review/device-matrix-plan.json` 在 Windows 10/11、125%/150%/200%、
   混合 DPI 多显示器、演示全屏、专注模式、安装/升级/卸载和开机自启场景
   完成九项具名证据。
6. 匿名统计预留开关仍锁定为关闭，旧值不会作为未来授权；另有自愿校园试点的
   28 天本地按日聚合、无时间戳会话/异常中断计数、人工摘要、退出即删和
   第 35 天起下次启动清除实现，不配置统计端点。v1 同意不会静默迁移；真实招募
   仍需具名负责人、联系方式、隐私/伦理批准和冻结候选真机退出/强杀验证。
   设置页已能清除设置、每日状态、历史、收藏、反馈和天气缓存，同时关闭开机启动；
   当前锁文件的 npm、OSV 与原生 RustSec Windows 目标漏洞为 0，但仍需 5 项
   停止维护依赖处置、非目标发现复核和具名安全隐私评审。
7. 当前开发机的 NSIS 安装、启动和卸载已通过，且证据与安装包哈希绑定；
   MSI 管理员生命周期与两次重启自启的安全执行脚本和证据门禁已经就绪，但尚未
   在获批环境执行；`0.1.0 → 0.2.0 → 0.1.0` 的 NSIS 升级/人工回滚脚本也已
   就绪，但当前账号存在真实数据，只能在干净专用账号执行。内容撤回运行时、
   离线缓存、防回退与自动演练已完成，仍缺生产网关和具名客户端演练。须按
   `docs/WINDOWS_MANUAL_EVIDENCE.md` 与 `docs/INCIDENT_RUNBOOK.md` 生成真实报告，
   并完成多设备重复验证和四周用户试点；第二实例与托盘唤醒已在开发机通过。

因此当前可称为“可安装的 M1 试用版”，不能称为已完成生产发布。
