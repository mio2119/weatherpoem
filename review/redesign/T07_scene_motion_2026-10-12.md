# T07 诗境背景、轻动效与单一组件自验收

状态：**部分通过**。规则映射、CSS 静态画面与动效开关已实现；隔离小雨场景的同机偏好开/关资源对照、当前媒体偏好、原生 CSS 动画状态及隔离 WebView2 强制减少动态后的计算样式已有证据。2026-10-14 补齐了 14 组隔离浏览器天气/诗境静态矩阵。六类场景的原生视觉矩阵、真实 Windows 系统设置切换后的原生检查、可归档短录屏和真人视觉检查尚未完成，不能签 A7 全通过。

2026-10-15 作品意象增量：先审查端午节《端午》的旧隔离画面，发现角标“节”和右上圆纹只传达通用节日，与诗句中的“楚江”联系很弱。现在仅在**端午节且确为文秀《端午》**时，以“江”角标和右侧低对比静态水纹表现原文意象；无外部素材或新增依赖，不把楚江说成当地河流或实时天气。离开该节日或换成其他作品仍使用原规则。规则反例先红后绿，组件测试确认画面语义。隔离 Chrome 155 的浅、深主题及安全/撤回 10 组矩阵通过，[原始测量](./evidence/T05_BROWSER_FESTIVAL_CHU_RIVER_20261015.json)；逐张比较最终[浅色画面](./evidence/T07_FESTIVAL_CHU_RIVER_LIGHT_20261015.png)和[深色画面](./evidence/T07_FESTIVAL_CHU_RIVER_DARK_20261015.png)，水纹收在右侧、诗文与操作未被遮挡。期间发现旧安全演练缓存已不符合现行来源和观测时间校验，完整矩阵曾停在预警页；只修复隔离测试夹具，保持每条预警标明“隔离演练”，未放宽产品缓存规则。另跑 14 组天气诗境回归，`lint`、`typecheck`、261 项测试、`build`、`accessibility:check` 均通过。此批只证明一首作品的静态意象及隔离浏览器布局，不代表其他诗作已完成专属场景、原生 WebView2/实际缩放/动态短录屏或真人审美；A7 仍为**部分通过**。

2026-10-15 中秋《水调歌头·明月几时有》增量：通用节日纹样是多层圆弧，同一首词的隔离对照画面中圆弧延伸到诗句和底部操作附近，而且只说明“节日”，未回应节选“千里共婵娟”。先在规则与诗笺组件加入失败反例；旧规则返回“节”且没有专属 `motif`，两项预期失败。现在仅在**中秋节且确为苏轼此词**时显示“月”印记和右侧低对比静态月影／分隔的两段远岸线，说明为“作品意象：共望明月；中秋节关联作品，不代表当地天气”。离开节日或换成《静夜思》仍不复用这个专属纹样；真实天气未更新时仍显示“天气未更新”，不把词中明月冒充当地晴夜。没有新增图片、字体、依赖或循环动画。

用本项目日历库核定受控日期为 2026-09-25 中秋节；隔离 Chrome 155 的浅／深主题、392×720 与 320×260 两档逻辑视口共 2 个场景通过：题名和节选逐字一致、理由对应中秋、月影静态，页面无横向溢出，低视口滚动后操作区可达。[原始测量](./evidence/T07_BROWSER_MID_AUTUMN_COMPARISON_20261015.json)及最终[浅色](./evidence/T07_MID_AUTUMN_SHARED_MOON_LIGHT_20261015.png)、[深色](./evidence/T07_MID_AUTUMN_SHARED_MOON_DARK_20261015.png)画面留存；同一页面去掉专属 `data-motif` 并恢复旧“节”印记得到的[浅色通用对照](./evidence/T07_MID_AUTUMN_GENERIC_COMPARATOR_LIGHT_20261015.png)、[深色通用对照](./evidence/T07_MID_AUTUMN_GENERIC_COMPARATOR_DARK_20261015.png)是**DOM 模拟旧视觉**，不是旧提交的真实截图。逐张查看，最终月影限制在纸面右侧，没有盖住诗句和按钮；通用对照的圆弧明显跨进了正文／底部附近。端午／安全 10 组、天气 14 组隔离回归均通过；`lint`、`typecheck`、全量 263 项测试、`build`、`accessibility:check` 通过。以上仍不证明当前源码原生 WebView2、系统缩放、动效短录屏或真人连续使用审美，A7 **继续部分通过**。

实施：`src/core/poem-scene.ts` 只使用当前日历、已发布诗词的标签和当前天气状态决定画面。诗作确实标注对应节日时，节日意象优先；雨、雪、晴、晴夜仅在天气为 fresh **且诗作有同类天气标签**时启用。天气真实但诗作未匹配时，信息栏仍如实显示天气，装饰则退回节气或抽象季节纹样，不把天气画面强加给按其他原因选出的诗。缓存、离线、未知及未覆盖天气也不用实时天气画面，组件说明明确“不代表当地实时天气”。安全提醒由 App 的独立视图优先显示，选择器也不会给安全状态套用普通天气诗境。页面最多出现一个小印记。

视觉约束：保留项目已有暖纸色和单一朱砂点缀，不引入新图片、字体、音频或外部资源。场景仅用 CSS 在诗笺右侧低对比装饰层表现，不盖住诗句、理由、按钮及键盘焦点；文字保持静止。雨/雪只让装饰层做缓慢位移，晴日只做轻微明暗呼吸，节日/夜/季节画面静止。`prefers-reduced-motion`、应用的减少动态偏好、隐藏/最小化和页面不可见状态都关闭循环动画。选择这一代码原生纹样方案，无需新增素材许可项。

已核对：

- 规则测试覆盖节日胜过雨、鲜活雨/雪/晴/晴夜、缓存/离线退回抽象、以及安全提醒优先。
- 2026-10-13 增补“真实下雨，但当前诗没有雨标签”的反例：情境栏继续显示实际雨况，诗笺不出现雨动效，改用抽象季节纹样。`poem-scene` 规则测试与 `PoemCard` 组件测试均通过；这是源码/组件证据，尚无对应新哈希原生画面，A7 仍为部分通过。
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

## 2026-10-14 隔离浏览器天气与离线静态矩阵

新增 `scripts/test-redesign-browser-scene-safety.mjs --weather-matrix`，沿用独立浏览器资料与已发布诗词，注入明确标注的隔离天气及受控本地时钟；不连接真实当地天气、不触碰用户资料、不启动可见 WeatherPoem EXE。浅/深色各核对 7 种情况：新鲜小雨配《春夜喜雨》、新鲜雪配《江雪》、新鲜晴配《秋词》、晴夜配《枫桥夜泊》、缓存雪、离线未知，以及真实小雨与《秋词》标签不匹配。对每组核对作品节选、情境栏、规则理由、`scene`、可访问诗境说明、减少动态计算样式、392×720 视口及 320×260 低视口的横向溢出和操作可达性。

初测发现推荐理由使用“当地正有晴／雪”；这不是诗境映射错误，而是用户可见的中文文案缺陷。T02 先建立 4 个失败反例，再把新鲜天气理由改为按天气类型表述，当前规则为 `1.2.3`，并补全部 12 种可用天气类型的短语测试。重新执行矩阵后 **14/14 通过**：雨、雪、晴、晴夜使用与诗作相符的场景；缓存雪、离线和诗作不匹配的小雨回退抽象季节纹样，其中前两种和不匹配场景的诗境说明均注明不代表当地实时天气。隔离降动效下装饰不无限循环，所测视口无横向溢出，低视口滚到底后操作可见。逐张查看 14 张静帧，未见装饰遮住诗文或按钮；这只是本次逻辑尺寸的视觉观察，不是数值对比度、真实 DPI 或真人审美结论。

原始逐组报告：[T07_BROWSER_WEATHER_SCENES_20261014.json](./evidence/T07_BROWSER_WEATHER_SCENES_20261014.json)。14 张画面位于 `review/redesign/evidence/T07_BROWSER_*_ISOLATED_20261014.png`，画面下方均明示“隔离天气演练 · 非当地实况”；例图：[小雨浅色](./evidence/T07_BROWSER_FRESH_RAIN_LIGHT_ISOLATED_20261014.png)、[雪深色](./evidence/T07_BROWSER_FRESH_SNOW_DARK_ISOLATED_20261014.png)、[缓存雪浅色](./evidence/T07_BROWSER_CACHED_SNOW_LIGHT_ISOLATED_20261014.png)、[不匹配小雨深色](./evidence/T07_BROWSER_MISMATCH_RAIN_DARK_ISOLATED_20261014.png)。脚本无参数的原 T05 节日／安全矩阵仍为 **10/10 通过**，没有被新模式破坏。完成后 `lint`、`typecheck`、全量测试（26 文件、195 项）、`build`、`reason:check`、`requirements:check` 通过。

未测仍是 A7 的必需子项：新当前源码的原生 WebView2 浅深色场景、真实 Windows 减少动态设置切换、隐藏后的渲染停机、可归档短录屏、实际系统缩放/对比度与真人视觉判断。隔离浏览器静帧不能证明这些，也不能以旧内部 EXE 哈希对应的资源报告证明当前源码；A7 继续为**部分通过**。

## 2026-10-14 诗境叠色最不利对比度复核

后续对当前 CSS 纸面底色、装饰层最大不透明度和文字色做静态合成计算，发现原浅色次要字在最强纹样下约 **4.17:1**、原深色淡字约 **4.03:1**，低于本项目普通文本 **4.5:1** 的自动门槛。先把这一组合加入 `scripts/accessibility-check.mjs`，检查按预期失败；再把浅色 `--muted`/`--faint` 调为 `#665f54`、深色 `--faint` 调为 `#ada598`，深色装饰浓度从 15% 降至 13%。复验最不利组合浅色次要字/淡字均 **5.00:1**、深色淡字 **5.03:1**、深色强调字 **4.73:1**；其余所测诗境文字也在 4.5:1 以上。无障碍自动基线版本同步到 `2026.10-accessibility-v2`，人工读屏、真实系统对比度主题及 200% 缩放依然是待验项。

颜色变化后重新运行同一 14 组隔离浏览器天气矩阵并通过，当前源码对应的原始报告为 [T07_BROWSER_WEATHER_SCENES_CONTRAST_20261014.json](./evidence/T07_BROWSER_WEATHER_SCENES_CONTRAST_20261014.json)，当前静帧为 `review/redesign/evidence/T07_BROWSER_*_ISOLATED_CONTRAST_20261014.png`。修订前的无 `CONTRAST` 报告和画面保留为发现问题时的证据，不能再代表当前颜色。人工复看新小雨浅色、雪深色、离线深色及不匹配小雨浅色代表帧，诗文和操作未见明显遮挡；静态颜色计算和截图不能证明 WebView2 实际绘制、系统辅助技术或长期视觉疲劳。原 T05 节日／安全浏览器矩阵初次重跑时画面 10/10 报告通过，但 Windows 临时资料目录锁定导致清理失败，故该次不算脚本通过；放宽受控浏览器关闭后的清理重试并延长导航超时后，再运行得到完整退出码 0、10/10 通过。A7 仍为**部分通过**。

## 2026-10-15 原生隐藏／最小化动效停机与当前候选资源对照

上一批防旧诗闪现的遮挡使 WebView2 隐藏时不再保留诗境，但在旧内部 EXE `C69C991F182DE286623F9DBA379C92FA8DA7B597ACB28886D8FFF609F525A015` 上建立原生反例发现：雨景 `scene-drift` 已消失，加载遮挡的 `loading-slide` 却仍以无限循环运行；WebView2 此时的 `document.visibilityState` 仍为 `visible`。修复只针对非活动窗口禁用加载细线动画，并加上桌面能力契约；没有放宽雨景的正常动效和系统减少动态规则。

新隔离内部 EXE `.work/redesign-motion-stop-20261015/release/weatherpoem.exe` 的 SHA-256 为 `0C6D96DF719366F9068D435D0277C2E7BC0ED72B23634143F88396BF695DF76B`，未替换旧发布文件、未安装。用专用临时资料和明确标注“小雨（隔离演练）”的天气，分别以[隐藏到托盘](./evidence/T07_NATIVE_HIDDEN_MOTION_STEADY_20261015.json)和[最小化](./evidence/T07_NATIVE_MINIMIZED_MOTION_STEADY_20261015.json)测试：显示时计算样式为 `scene-drift` 且运行中；隐藏／最小化后诗境节点移除、加载细线动画为 `none`、运行中动画数为 0，3 秒后复查仍为 0；第二次启动唤醒原生窗口后雨景动效恢复。首次[隐藏](./evidence/T07_NATIVE_HIDDEN_MOTION_20261015.json)及[最小化](./evidence/T07_NATIVE_MINIMIZED_MOTION_20261015.json)记录保留为同哈希的短时观察。两张[隐藏前](./evidence/T07_NATIVE_HIDDEN_MOTION_20261015_before.png)、[找回后](./evidence/T07_NATIVE_HIDDEN_MOTION_20261015_after.png)原生静帧已查看：细雨装饰未遮住诗句、理由或主要操作。

[6 秒原生雨景动图](./evidence/T07_NATIVE_RAIN_CLIP_20261015_motion.gif)由隔离 WebView2 同一页面连续抓取 24 帧形成，原始[取帧报告](./evidence/T07_NATIVE_RAIN_CLIP_20261015.json)记录 23/23 组相邻画面变化、候选哈希、诗题与场景身份检查；它仅证明这一次低幅度动效确实发生，不代表其他节日／天气场景或真人对节奏的评价。[系统减少动态复测](./evidence/T07_SYSTEM_REDUCED_MOTION_motion-stop-20261015.json)在该子进程强制媒体偏好后，雨景动画仍有名称，但时长约 `0.01 ms` 且只迭代一次；没有改变 Windows 全局显示设置。

同一候选的[60 样本静／动资源报告](./evidence/T07_MOTION_RESOURCE_motion-stop-20261015.json)已由独立命令按原始样本重算：平均 CPU 静态 `0.0499%`、动态 `1.6029%`，增量 `1.553` 个百分点（目标 ≤2）；合并进程工作集 P95 静态 `378.59 MiB`、动态 `382.40 MiB`，增量 `3.81 MiB`（目标 ≤20）。报告生成时短录屏尚未归档，因此其 `visibleMotionRecordingCaptured=false` 是当时状态，不能改写原报告；动图是随后独立取得的证据。以上是当前机器、单一隔离雨景和单次顺序试验，不能代替真实系统减少动态切换、长期托盘空闲、全场景或具名视觉评审；A7 整体仍**部分通过**。

2026-10-16 升至稳定 Tauri 2.12.4 后，旧内部候选 `4EA661A128AB011C63495A563DBDEB0598D463B9247C14CF52D3EA1CD67E4E00` 的隔离最小化雨景测试在最初检查停机、等待 3 秒后发现 `sceneActive` 又变成 `true`；该断言失败时没有伪造通过报告。根因是 WebView2 对最小化页面仍可能报告 `visible`，后续焦点/可见事件仅按网页状态错误重启动效。应用现同时查询原生窗口的显示与最小化状态，查询失败时保守停机，并补单元测试。修复后新内部候选 `DB56F155495900B11E73CCFABCC4D99BFFC24F233AEBD0127772639811DD391D` 的[最小化稳态](./evidence/T07_NATIVE_MINIMIZED_MOTION_TAURI212_FIX_20261016.json)与[隐藏稳态](./evidence/T07_NATIVE_HIDDEN_MOTION_TAURI212_FIX_20261016.json)均通过：遮挡后无运行中动画，3 秒后仍停机，第二实例唤醒后雨景恢复。[隔离系统减少动态报告](./evidence/T07_SYSTEM_REDUCED_MOTION_tauri-212-minimize-fix-20261016.json)及独立复核也通过；没有改变 Windows 全局偏好。完整资源与设备矩阵、真人视觉判断仍未验，A7 保持**部分通过**。

2026-10-17 自动显示焦点修正又改变了内部 EXE 哈希；新哈希 `0921010061A8D66C551DEAC609B74063433C88B07D836B321F4EAECAF401D4AD` 的[原生最小化雨景回归](./evidence/T07_NOACTIVATE_MINIMIZED_MOTION_20261017.json)和[隐藏雨景回归](./evidence/T07_NOACTIVATE_HIDDEN_MOTION_20261017.json)均通过 3 秒停机与第二实例唤醒。[隔离系统减少动态复测](./evidence/T07_SYSTEM_REDUCED_MOTION_tauri-noactivate-experiment-20261017.json)及独立检查也通过；未修改 Windows 全局偏好。

同一哈希的[静／动资源对照](./evidence/T07_MOTION_RESOURCE_tauri-noactivate-experiment-20261017.json)各采集 60 个样本，独立检查通过：平均 CPU 静态 `0.0083%`、动态 `0.2729%`，增加 `0.2646` 个百分点（门槛 ≤2）；合并进程工作集 P95 静态 `373.38 MiB`、动态 `380.69 MiB`，增加 `7.31 MiB`（门槛 ≤20）。这是同机、单一隔离雨景、静态先于动态的顺序试验；资源报告生成时 `visibleMotionRecordingCaptured=false`，不得事后改写。

随后在同一哈希、独立临时资料中生成[6 秒原生雨景动图](./evidence/T07_NOACTIVATE_RAIN_CLIP_BUNDLED_PYTHON_20261017_motion.gif)与[取帧报告](./evidence/T07_NOACTIVATE_RAIN_CLIP_BUNDLED_PYTHON_20261017.json)：WebView2 连续 24 帧、23/23 组相邻画面变化，隐藏后 3 秒无运行中动画，第二实例唤醒后恢复；[隐藏前](./evidence/T07_NOACTIVATE_RAIN_CLIP_BUNDLED_PYTHON_20261017_before.png)与[找回后](./evidence/T07_NOACTIVATE_RAIN_CLIP_BUNDLED_PYTHON_20261017_after.png)静帧已逐张查看，诗文与主要操作未见明显遮挡。第一次编码尝试因系统默认 Python 缺少 Pillow 而中断，仅留下[未成套前帧](./evidence/T07_NOACTIVATE_RAIN_CLIP_20261017_before.png)，不计作通过；重跑使用工作区已有的图像工具环境，没有覆盖该失败现场。动图只能证明这一次隔离雨景有低幅度变化，仍不能替代完整场景、真实系统设置切换和真人长时视觉判断。旧哈希证据不能移作本哈希结论，A7 继续**部分通过**。

2026-10-19 在诗笺尺寸修复后的当前未安装候选 `3D3856613786D6961B6BE7ECF5274F8E017DE79E1AB8CAA541F8B498A4B0ED10` 上，重跑[同诗境静／动资源对照](./evidence/T07_MOTION_RESOURCE_glance-startup-fix-20261019.json)及独立复算。隔离资料同日、同一《山居秋暝》雨景，静态和动态各 60 样本，约 106 秒：主进程与 WebView2 合并平均 CPU 从 `0.0111%` 到 `1.1612%`（增量 `1.1501` 个百分点，目标 ≤2），工作集 P95 从 `371.44 MiB` 到 `382.57 MiB`（增量 `11.13 MiB`，目标 ≤20），阈值通过。动画从 `none` 切为 `scene-drift`/16 秒无限循环。另有[减少动态媒体偏好报告](./evidence/T07_SYSTEM_REDUCED_MOTION_glance-startup-fix-20261019.json)：单独给该 WebView2 进程加入 `--force-prefers-reduced-motion` 后，系统媒体查询为 true、应用开关为 false，动画缩至 `0.00001s` 并只运行一次；未改 Windows 系统设置。资源报告仍明确 `visibleMotionRecordingCaptured=false`，因此本批不提交新动图，也不据此签收真实 Windows 减少动态切换、可见动画节奏、隐藏/最小化停机、其他场景或真人视觉感受；A7 保持**部分通过**。

随后在同一候选、单独隔离资料中完成[原生雨景动效与最小化停机复验](./evidence/T07_NATIVE_GLANCE_CANDIDATE_MOTION_STOP_PYTHON_RETRY_20261019.json)：初始《山居秋暝》雨景为 `scene-drift`，24 帧、6 秒录制中 23/23 组相邻帧有变化；最小化后立即无运行中动画，3 秒后仍为 0，第二实例唤回后雨景恢复。已查看[录制](./evidence/T07_NATIVE_GLANCE_CANDIDATE_MOTION_STOP_PYTHON_RETRY_20261019_motion.gif)及[隐藏前](./evidence/T07_NATIVE_GLANCE_CANDIDATE_MOTION_STOP_PYTHON_RETRY_20261019_before.png)/[唤回后](./evidence/T07_NATIVE_GLANCE_CANDIDATE_MOTION_STOP_PYTHON_RETRY_20261019_after.png)画面；雨纹低对比，文字和操作保持静止、可读。首轮导出因系统 Python 缺少 Pillow 失败，记录与遗留首帧见[失败说明](./evidence/T07_NATIVE_GLANCE_CANDIDATE_MOTION_STOP_PYTHON_UNAVAILABLE_20261019.md)；改用工作区 Python 后在新资料成功重跑，未覆盖失败文件。该录制只证明当前单机单一隔离雨景，不证明 Windows 全局减少动态切换、隐藏托盘停机、其他场景或真人长时间观看，A7 仍**部分通过**。

2026-10-19 键盘焦点修复候选 `7BFC5F340E992D15D95BE56DAF0C356A7BA261C0B9A8B3BF795B59E5310FF627` 又重跑托盘隐藏停机：[报告](./evidence/T07_NATIVE_GLANCE_FOCUS_MOTION_STOP_20261019.json)使用隔离合成雨景、临时资料和第二实例找回。初始 `scene-drift` 正在运行；诗笺隐藏后立即以及等待 3 秒后，`sceneActive=false`、雨景动画为空、运行中动画数为 0；找回后雨景动效恢复。已逐张查看[隐藏前](./evidence/T07_NATIVE_GLANCE_FOCUS_MOTION_STOP_20261019_before.png)与[找回后](./evidence/T07_NATIVE_GLANCE_FOCUS_MOTION_STOP_20261019_after.png)，诗句、理由与操作未被雨纹遮住，画面标明隔离演练。没有连接真实天气或修改系统时间、显示设置、启动项；这补当前哈希的单一雨景托盘子项，不外推为全部场景、真实 Windows 减少动态切换或长时真人观看，A7 继续**部分通过**。
