# T07 诗境背景、轻动效与单一组件自验收

状态：**部分通过**。规则映射、CSS 静态画面与动效开关已实现；隔离小雨场景的同机偏好开/关资源对照、当前媒体偏好、原生 CSS 动画状态及隔离 WebView2 强制减少动态后的计算样式已有证据。六类场景的原生视觉矩阵、真实 Windows 系统设置切换后的原生检查、可归档短录屏和真人视觉检查尚未完成，不能签 A7 全通过。

实施：`src/core/poem-scene.ts` 只使用当前日历、已发布诗词的标签和当前天气状态决定画面。诗作确实标注对应节日时，节日意象优先；雨、雪、晴、晴夜只在天气为 fresh 时启用。缓存、离线、未知及未覆盖天气只用抽象季节纹样，组件说明明确“不代表当地实时天气”。安全提醒由 App 的独立视图优先显示，选择器也不会给安全状态套用普通天气诗境。页面最多出现一个小印记。

视觉约束：保留项目已有暖纸色和单一朱砂点缀，不引入新图片、字体、音频或外部资源。场景仅用 CSS 在诗笺右侧低对比装饰层表现，不盖住诗句、理由、按钮及键盘焦点；文字保持静止。雨/雪只让装饰层做缓慢位移，晴日只做轻微明暗呼吸，节日/夜/季节画面静止。`prefers-reduced-motion`、应用的减少动态偏好、隐藏/最小化和页面不可见状态都关闭循环动画。选择这一代码原生纹样方案，无需新增素材许可项。

已核对：

- 规则测试覆盖节日胜过雨、鲜活雨/雪/晴/晴夜、缓存/离线退回抽象、以及安全提醒优先。
- 浏览器预览的“天气未更新”场景中，浅色和深色静态帧均显示一个“秋”印记与极淡季节背景；诗句、理由、主要操作仍可辨读。未把抽象季节画面说成当地天气。
- `npm.cmd run lint`、`npm.cmd run typecheck`、完整测试（24 文件、128 项）和前端构建通过。桌面服务模拟测试确认显示时开启诗境、隐藏或最小化时关闭诗境活动标记。

仍需完成：

- 原生 Windows 11 隔离开发窗口已实看未知天气的抽象“秋”印记，与“天气未更新”文字一致。节日、雨、雪、晴、夜、安全提醒的浅/深色**真实原生**静态帧及短录屏仍缺，须逐项核对数据与画面；旧候选 EXE 不承载新诗境。
- 真实 Windows 隐藏/最小化/系统减少动态时验证渲染确已停下；当前测试只证明代码路径与浏览器样式约束。
- 在专用环境中验证真实 Windows 系统设置切换到减少动态后动画停止；另录制可归档的短片复核“小雨”动态纹样节奏。隔离 WebView2 强制媒体偏好的检查只覆盖网页响应，不替代真实系统设置切换。

2026-10-13 对新内部候选 `89DE01D7FB403D2DB2F10484E50AF2C96FF970797EDDAF20415D03994E28930A` 做真实天气性能短测时，10 次已配置启动全部进入离线规则；该画面是静态季节纹样，不会运行晴/雨/雪循环动画。此次 60 秒托盘空闲测量不能充当动效开/关对照。后续需在同机、同一可见动态诗境下分别测静态与轻动效，并包含 WebView2 渲染进程；详见 T09 第三轮记录。

原生调试链接错误已经解除，但 T09/T10 新候选门禁尚未完成，A7 保持部分通过。

2026-10-13 新增隔离资源对照：仅在系统临时目录启用 `scene-rain`，界面明确显示“小雨（隔离演练）”及“不代表当地实时天气”。内部 `tauri build --no-bundle` EXE 为 `.work/redesign-motion-20261013/release/weatherpoem.exe`，SHA-256 `30CD0842AA1D7922F33DDC95DA32F2C77AEBF777D9338B6A5C0A194E3A2A1344`，不是 NSIS/MSI 发行候选。真实原生窗口已见《山居秋暝》与隔离场景标记。

同一临时资料、同一自然日和同一作品，先使用“减少动态”，再关闭该偏好；每轮预热 5 秒，记录 60 个样本，实际墙钟时长约 90 秒。采样覆盖 WeatherPoem 主进程及该资料目录的 WebView2 子进程，包含 renderer；不是仅测主进程。原始报告为 `review/redesign/evidence/T07_MOTION_RESOURCE_motion-20261013.json`，可用 `npm.cmd run performance:motion:redesign:check -- motion-20261013` 重新核验候选哈希、就绪标记、同诗同日、样本及计算。

| 指标 | 静态偏好 | 轻动效偏好 | 增量 | 方案目标 |
|---|---:|---:|---:|---:|
| 合并进程平均 CPU | 0.0712% | 1.4063% | +1.3351 个百分点 | ≤2 个百分点 |
| 合并进程工作集 P95 | 368.13 MiB | 378.55 MiB | +10.42 MiB | ≤20 MiB |

这只证明隔离偏好切换下的资源增量达到目标；工作集数值是**可见窗口加 WebView2 的合计**，不能与既有“托盘空闲主进程 <100 MiB”混为一谈。报告明确 `a7OverallSatisfied=false`、`visibleMotionRecordingCaptured=false`、`systemReducedMotionMediaQueryChecked=false`。静态先测、动态后测的顺序也可能带来缓存/环境影响；若后续确认系统抑制了动画，必须修正条件并重测，不可沿用本次“通过”数字签收 A7。

同日进一步构建了带原生计算样式探针的新内部 EXE `.work/redesign-motion-probe-20261013/release/weatherpoem.exe`，SHA-256 `2533E162174379EC588DC84CEF0B6D4FE8CF6B763E5B866500C5A084627059E2`。新报告 `review/redesign/evidence/T07_MOTION_RESOURCE_motion-probe-20261013.json` 的两轮就绪标记均为 `scene-rain` 和同一首《山居秋暝》；静态偏好的动画名为 `none`，动态偏好为 `scene-drift`、16 秒无限循环，系统 `prefers-reduced-motion` 为 `false`。在原生小窗连续观察的两帧中，低对比雨纹位置变化，诗句和操作保持稳定；这两帧未归档成短录屏。

| 新候选指标 | 静态偏好 | 动态偏好 | 增量 | 方案目标 |
|---|---:|---:|---:|---:|
| 主进程＋WebView2 平均 CPU | 0.2088% | 1.6774% | +1.4686 个百分点 | ≤2 个百分点 |
| 主进程＋WebView2 工作集 P95 | 399.18 MiB | 387.90 MiB | -11.28 MiB | 增量 ≤20 MiB |

新候选各采集 60 个样本、约 93 秒墙钟时间，独立检查命令为 `npm.cmd run performance:motion:redesign:check -- motion-probe-20261013`，它核对新 EXE 哈希、同诗同日、原生动画状态与原始样本重算。内存负增量只表示本次测量的动态轮次较低，**不**证明动画节省内存；两轮顺序和系统背景波动仍需在后续回归中观察。报告继续明确 `a7OverallSatisfied=false`，旧 `30CD…` 的无计算样式报告保留为预试验，不混作新候选证明。

同一内部 EXE 另以隔离资料启动了专门的 WebView2 媒体偏好检查，报告为 `review/redesign/evidence/T07_SYSTEM_REDUCED_MOTION_motion-probe-20261013.json`，可运行 `npm.cmd run performance:motion:system-reduced:check` 独立核验 EXE 哈希、就绪标记和计算样式。测试只给该子进程设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--force-prefers-reduced-motion`，应用内“减少动态”保持关闭；原生 WebView 报告 `systemReduced=true`，雨景装饰层的 `scene-drift` 动画时长缩至 `1e-05s`、仅运行 1 次，而正常媒体偏好下为 16 秒无限循环。测试未改变 Windows 全局显示设置或真实用户资料；隔离临时资料已清理。此项证明当前实现对 WebView2 的减少动态媒体查询有响应，**不证明**用户在系统设置中切换后的整机端到端行为。WebView2 启动参数机制参见 [Microsoft 文档](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags)，强制减少动态开关定义参见 [Chromium 源码](https://chromium.googlesource.com/chromium/src/+/137.0.7151.119/ui/gfx/switches.cc)。

一次隔离窗口帧采集未能持续锁定 WeatherPoem，后续帧来源不符。该次采集判为**无效**，10 张临时帧与专用隔离资料均已删除，未归档成片。后续短录屏应在每帧核对目标窗口身份和画面内容；目前 `visibleMotionRecordingCaptured` 仍为 `false`。
