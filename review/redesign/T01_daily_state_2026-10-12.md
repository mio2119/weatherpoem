# T01 本地日期、换诗与展示历史自验收

状态：**部分通过**。`redesign/phase-1` 的源码日期测试已通过，后续已补隔离 Windows 内部 EXE 的旧 SQLite 实例升级证据；午夜、休眠与托盘端到端仍未测。新 EXE 不是正式发行候选。

2026-10-19 提示退出留位调整后的最终本批内部 EXE `4C2BE63A80D1D0622F9AFEB2084870EC8E4F18C500F862F43E97BA120C836DCC`，再次完成[同哈希页面局部跨日报告](./evidence/T01_NATIVE_CROSS_DAY_LATE_RAIN_toast-leave-20261019.json)：10 月 20 日离线《登飞来峰》→合成小雨《山居秋暝》，SQLite 20 日 `shown` 与画面一致，更新提示和主按钮不相交。[更新前](./evidence/T01_NATIVE_CROSS_DAY_LATE_RAIN_toast-leave-20261019_new_day_before_late.png)与[更新后](./evidence/T01_NATIVE_CROSS_DAY_LATE_RAIN_toast-leave-20261019_after.png)画面已查看。旧哈希的跨日报告不移作新候选结果；真实系统午夜、托盘找回和休眠仍未验，A1 保持部分通过。

同日因提示条布局另建最终本批内部 EXE `7BA3F65D56277E67A7B512A5A1E80A152AF397C2C3E6BAC736738004ACA3729C`，在[同哈希跨日复测](./evidence/T01_NATIVE_CROSS_DAY_LATE_RAIN_toast-fit-20261018.json)中再次得到 19 日离线《登飞来峰》→合成小雨《山居秋暝》，SQLite 为 19 日 `shown`；更新提示与“继续读”不相交。旧 `BF5…` 证据保留为前版验证，不移作新哈希。页面局部时钟、可见窗口而非真实系统跨夜/托盘路径的限制不变，A1 仍部分通过。

2026-10-18 补齐非启动载入的晚到天气：`loadToday` 在跨日选诗时也接入有日期、城市和加载批次保护的续取回调，若晚到安全结果在选诗异步过程中抵达，则先缓冲并完成安全状态后才揭开诗笺。App 级受控时钟测试覆盖次日安全提醒不露出昨日诗。新未安装内部 EXE `.work/redesign-weather-all-loads-20261018/release/weatherpoem.exe`，SHA-256 `BF5CCC3C7DF1D3B9DF41BC2AC4A5CFF702AE9651C295C16C8FD82D8F77B69FEC`。在独立 SQLite/WebView2 窗口中仅把**页面局部**日期推进到 10 月 19 日，拦截两次天气请求并让第二次返回明确的合成小雨；[延迟返回报告](./evidence/T01_NATIVE_CROSS_DAY_LATE_RAIN_DEFERRED_weather-all-loads-20261018.json)记录先出现“天气未更新”的《登飞来峰》，后更新为“小雨”的《山居秋暝》，SQLite 当日状态为 19 日 `shown`。两张[返回前](./evidence/T01_NATIVE_CROSS_DAY_LATE_RAIN_DEFERRED_weather-all-loads-20261018_new_day_before_late.png)与[返回后](./evidence/T01_NATIVE_CROSS_DAY_LATE_RAIN_DEFERRED_weather-all-loads-20261018_after.png)画面已逐张查看，诗句可读；另留一次较快续取的[同哈希复测](./evidence/T01_NATIVE_CROSS_DAY_LATE_RAIN_weather-all-loads-20261018.json)。这只是可见窗口焦点触发的隔离演练，**不是**真实系统午夜、休眠或托盘合成器逐帧验收；A1 仍**部分通过**。

2026-10-14 修复前反例：同日本地 `dailyState` 若保留旧规则已展示、但现行季节过滤不再允许作为新推荐的作品，`src/App.vue` 会把该作品单独传给推荐器，结果候选被过滤为空并进入错误页。先在 `src/core/recommendation.test.ts` 和 `src/App.test.ts` 加入失败回归；当时定向测试 2 失败、31 通过。预期只保留仍有效的同日已展示作品与中性理由，不放宽次日或新推荐的过滤；还须补隔离旧 SQLite 样本。A1 不因修复此一反例而整体通过。

2026-10-14 本轮修复进展：新增显式 `retainedWorkId` 入口，并只在应用确认旧状态是当日本日已展示/保留/预警前保留、且作品仍在可发布目录时使用。旧诗与当前季节冲突时继续展示，理由固定为“今天已选过这首诗，继续读它。”；次日重新选择，撤回作品进入内容校正页，用户主动换诗仍走严格的新候选过滤。含同日、次日和撤回的 App 级反例通过；隔离 Chrome 154 的旧浏览器资料于 2026-10-14 09:00 亚洲上海时区打开该诗并完成设置保存/复访，结果为 passed。此证据不是旧 SQLite 的跨季迁移、Windows WebView2、休眠或真实跨日实测，A1 继续为**部分通过**。

2026-10-13 增补 `src/App.test.ts` 的应用级模拟：在隔离 happy-dom 和浏览器本地存储中，以本地 23:59 启动诗笺、换一次诗，确认当天原诗与替换诗均保留、第二次换诗不可用；把时钟推进到次日 00:01 并触发窗口焦点事件后，当前日期与每日状态变为次日，历史只新增一条次日展示，换诗机会恢复；同日再次触发焦点不会多写展示。测试使用离线天气替身，没有改系统时钟或真实资料。它覆盖 App 的日期刷新路径，但不证明 Windows 休眠恢复、托盘主动打开、真实跨日运行或 SQLite 原生端到端，A1 仍为部分通过。

目标行为与问题：E01、E11；跨日重新选诗，单一当地日期控制换诗资格，同日原诗和替换诗均留在事件历史。

修改触点：`src/App.vue`、`src/core/daily-behavior.ts`、`src/types.ts`、`src/services/persistence.ts` 与对应测试。旧 `0.2.0` 发布物没有被重建或修改。

数据结构与迁移：新反馈写入 `localDate`，旧反馈按其 UTC 时间戳解释为设备当前当地日期。浏览器历史由“每日一条”改为最近 60 次展示事件。SQLite 新建 `recommendation_display_events`，只回填旧 `recommendation_history` 的可知每日记录一次；既有收藏和设置表不变，清除数据同时清理新事件表。旧版已经覆盖掉的同日原诗无法从旧表恢复，不得宣称完整回溯。

正向与反例检查：

- `npm.cmd run lint`、`npm.cmd run typecheck`、`npm.cmd run test`、`npm.cmd run build` 通过。改后 17 个测试文件、90 项测试。
- 受控本地时间 00:00、07:59、08:00、23:59，以及 23:59→次日的换诗资格测试通过；旧 UTC-only 反馈与新显式当地日期均有覆盖。
- 浏览器持久化测试验证同日原诗/替换诗共同保留、收藏可重载、旧结构可读取。SQLite 迁移关键 SQL 在内存数据库验证：旧记录重复迁移一次后仍仅一条，新增展示事件共两条，反馈列可新增。
- 托盘手动打开、窗口重新可见、每分钟可见性检查和返回诗笺路径已接入跨日刷新；日期在天气/理由异步等待中跨越午夜时会重新加载。
- `npm.cmd run check` 停在旧内容撤回演练报告过期；本批没有修改旧报告。不能据此宣称完整工程检查通过。

原生 Windows 检查：**部分完成**。2026-10-13 用具名内部候选 `.work/redesign-overlap-20261013/release/weatherpoem.exe`（SHA-256 `036E8FAD943554793DCDFF977B4E6FC99C86BB74C3C56B38296D6249701640D0`）在系统临时目录创建一份旧版 SQLite 结构：有设置、每日状态、每日历史、收藏、反馈，但没有新版展示事件表与反馈 `local_date` 列。用隔离天气场景连续启动两次后，旧收藏/反馈/设置/每日状态和原每日历史均保留；旧每日历史恰好回填一次，新日展示事件由 1 条增至 2 条，迁移不重复。测试脚本与结果分别为 `scripts/test-redesign-sqlite-migration.mjs` 和 `review/redesign/evidence/T01_SQLITE_MIGRATION_overlap-20261013.json`，测试退出码为 0。它没有读取真实用户数据库，也不证明浏览器存储、午夜或休眠行为。仍需在隔离资料目录验证托盘打开、休眠恢复、断网/联网、同日多次主动打开、午夜边界下收藏与反馈不丢失。不得在真实用户资料目录中执行破坏性测试。

2026-10-13 在加入“桌面 SQLite 失败不得静默降级”保护后，用新内部候选 `.work/redesign-storage-20261013/release/weatherpoem.exe`（SHA-256 `E7A42D12AD45FBD33EEAD869377328DF0E19548351AB0F0580242B8F136B2EC1`）重跑同一隔离旧库迁移，报告 `review/redesign/evidence/T01_SQLITE_MIGRATION_storage-20261013.json` 为通过：两次启动均进入离线诗笺，旧设置/收藏/反馈/每日状态保留，旧历史只迁移一次。这证明新哈希没有破坏已覆盖的迁移样本；午夜、休眠和真实用户库仍未测，A1 保持部分通过。

视觉检查：本批未调整界面；跨日卡片内容更新的实际截图仍待验证。新内部 EXE 的哈希见上，不是正式发布物；旧发行候选哈希见 T00，不能证明本批通过。

退出条件：日期与持久化自动检查通过，旧 SQLite 样本的真实 EXE 两次启动迁移通过；原生跨日/休眠、实际用户库、浏览器存储端到端和完整工程门禁未测/未过，故 A1 **部分通过**。下一步补原生跨日与托盘路径，不把受控旧库样本外推为所有历史资料安全。

2026-10-13 补充“等待理由期间连续换诗”反例：原实现先等待异步理由，再写入当日换诗反馈；这段等待中按钮仍显示“换一首”，第二次触发可再次进入处理流程。先用可控延迟的 App 级测试复现按钮未禁用，再增加处理中的重入保护和“正在换诗”状态。修复后即使再次向处理器发出点击，也只启动一次换诗理由请求、只新增一条 `replaced` 反馈及一次替换展示。另用受控时钟覆盖 23:59 发起、00:01 才收到理由的情况：取消旧日操作，刷新次日诗笺，不把前一天的换诗反馈或展示写到新日。组件测试确认处理中按钮不可用且文案准确。完整 `lint`、`typecheck`、`test`（26 文件、158 项）、`build` 和 `reason:check` 均通过。这些是模拟 DOM/本地存储与受控时钟证据；真实 WebView2 双击、跨日及 SQLite 事务一致性仍未测，A1 保持**部分通过**。

## 2026-10-15 从阅读／收藏返回时的跨日刷新

审查发现：已有定时器、窗口焦点和托盘手动打开会核对本地日期，但阅读页与收藏页的“返回诗笺”原先只把 `panel` 改成 `card`。如果用户停留在阅读页跨过午夜，点返回后会短暂看到昨天的诗笺，直到后续定时检查。`src/App.test.ts` 用受控本地时钟从 2026-10-13 23:59 到 10-14 00:01 先复现红测：返回后仍显示“10月13日”。修复将两个返回入口收敛到已有的 `returnToCard()` 日期核对路径；回“我的收藏”或设置仍保持原来处，不强制打断阅读。

红测转绿后，App 级测试继续从当天诗笺收藏作品，在收藏阅读页跨到 10-15 00:01；先返回收藏，再返回诗笺，立即显示 15 日。最终历史恰好为 13、14、15 日各一条，收藏仍保留。新增 `--midnight-audit` 隔离 Chrome 155 路径，在页面内注入可推进时钟、使用独立临时浏览器资料和阻断的天气 API，实际点击阅读与收藏的返回按钮。原始四阶段状态见 [T01 浏览器跨日报告](./evidence/T01_BROWSER_READING_RETURN_FINAL_20261015.json)：13 日《黄鹤楼》→14 日《夜雨寄北》→收藏页→15 日《旅夜书怀》；浏览器存储的日期/历史与画面一致，无横向溢出。三张已逐张查看的静帧为 [13 日](./evidence/T01_BROWSER_card_oct13_20261015.png)、[从阅读返回后的 14 日](./evidence/T01_BROWSER_card_oct14_after_reading_20261015.png)、[从收藏返回后的 15 日](./evidence/T01_BROWSER_card_oct15_after_favorites_20261015.png)。

本批 `lint`、`typecheck`、全量 `test`（26 文件、199 项）、`build` 通过；原浏览器存储和 T08 收藏找回模式均重跑通过。浏览器里的日期是**页面局部受控时钟**，不是改了 Windows 系统时间；天气为离线替身，没有启动可见 WeatherPoem EXE。该证据只补浏览器实际点击路径，不能代替新候选在原生 WebView2、托盘隐藏／重新打开、系统休眠／恢复及 SQLite 中跨日的端到端实测。A1 仍为**部分通过**。

## 2026-10-15 SQLite 每日状态与展示历史损坏反例

继续审查桌面启动资料时，内存 SQLite 的两条红测证明：`daily_state.state` 写成未知值、展示事件的 `work_id` 为空时，原 `load()` 仍将其作为正常状态交给上层。这可能影响当天保留诗及近期避重判断。现在桌面行先映射成业务对象，再复用浏览器资料的字段验证规则；异常时抛 `DesktopStorageUnavailableError`，不在读取时改写原始行。测试确认失败后原始值仍在，隔离修复为合法值后可重新载入；同批的空收藏 ID 也按同一规则拒绝，记录于 T03。三项定向反例先为 3 失败/13 通过，修复后 16/16；完整 `lint`、`typecheck`、`test`（26 文件、227 项）、`build`、`accessibility:check` 和 `requirements:check` 通过。这里只验证 Node SQLite 与插件替身，不证明当前源码的原生 EXE、用户数据库或跨日/休眠路径；A1 仍**部分通过**。

## 2026-10-15 本地日期键的格式与日历有效性

上批字段校验仅要求日期非空，因而 `2026-02-30` 和非标准格式 `2026-2-3` 仍可进入“今日状态”、展示历史或反馈的本地日键。浏览器旧资料和 SQLite 各建立三条失败反例，确认旧代码会接受这些值；修复后共用 `YYYY-MM-DD` 且实际存在于日历中的校验，合法闰日 `2024-02-29` 仍通过。损坏值触发资料停载，浏览器原始 JSON 与 SQLite 原始行在失败后不被覆盖，隔离修正日期后可再次读入。两份定向测试分别 24/24 和 19/19，完整自动测试 26 文件、234/234；`lint`、`typecheck`、`build`、`accessibility:check` 和 `requirements:check` 通过。独立 `pilot:four-week:check` 仍因旧试点计划过期失败，本批未改计划日期。以上是浏览器资料解析测试与 Node SQLite/插件替身证据，不是新原生候选的跨午夜、托盘、休眠或旧用户资料验收；A1 继续**部分通过**。

同日补实际浏览器路径：将“每日状态不存在日期、历史非标准日期、反馈不存在日期”加入已有旧资料矩阵，以系统临时目录的独立 Chrome 155 headless profile、阻断天气 API、392×430 逻辑视口运行。原有 6 类与新增 3 类共 **9/9** 通过：新增三类均显示资料错误页，不误入诗笺或首次设置，浏览器主资料原始字节不变，文档无横向溢出。随后恢复合法旧资料，设置草稿、保存刷新和旧收藏路径仍可完成。原始逐场景报告为 [T03 浏览器日期矩阵](./evidence/T03_BROWSER_DATE_MATRIX_20261015.json)。本次没有启动可见 WeatherPoem EXE、接触真实资料或连接当地天气；隔离浏览器不能证明 WebView2、SQLite 插件、托盘或系统时钟跨日，A1 仍**部分通过**。

## 2026-10-15 原生隐藏窗口的旧诗防闪现

本批先在 App 测试复现“隐藏后诗卡仍留在 DOM”。进一步用独立内部 EXE 和临时 SQLite 资料检查，发现 Windows WebView2 的窗口经原生 `hide` 后，`document.visibilityState` **仍为 `visible`**，因此只监听网页可见性无法保护托盘找回。修复在应用按钮隐藏／最小化前同步遮住诗卡，原生关闭消息也发出遮挡通知；窗口重新聚焦或由托盘打开时，先核对本地日期与撤回状态，校验结束才去掉遮挡。浏览器与 WebView2 可见性分歧被独立测试覆盖。

新内部候选为 `.work/redesign-reveal-20261015/release/weatherpoem.exe`，SHA-256 `C69C991F182DE286623F9DBA379C92FA8DA7B597ACB28886D8FFF609F525A015`。它不覆盖旧发布 EXE，也不是 NSIS/MSI 候选。[按钮隐藏→隔离次日恢复](./evidence/T01_NATIVE_HIDDEN_REVEAL_20261015.json)与[原生关闭消息→隔离次日恢复](./evidence/T01_NATIVE_CLOSE_REVEAL_20261015.json)均在 Windows 11 WebView2 中记录：15 日诗卡→窗口隐藏时只剩加载遮挡→仅在该 WebView 中把时钟推进到 16 日→恢复后显示 16 日诗卡；DOM 变化记录未出现可见的 15 日诗卡。Windows 系统时钟、真实资料与启动项均未改动，天气是隔离离线场景。复测脚本和记录不证明系统休眠／恢复、真实跨午夜、所有 DPI 或人手连续点击托盘；A1 继续**部分通过**。

同一哈希另留[含界面图的复测报告](./evidence/T01_NATIVE_HIDDEN_REVEAL_CAPTURED_20261015.json)，逐张检查[15 日诗笺](./evidence/T01_NATIVE_HIDDEN_REVEAL_CAPTURED_20261015_before.png)与[16 日诗笺](./evidence/T01_NATIVE_HIDDEN_REVEAL_CAPTURED_20261015_after.png)：日期、题名、作者、诗句、理由及操作在小窗均可读，无横向溢出。这是页面局部时钟演练的两张静帧，不能证明真实当天气象或中间动画的每一帧。

本批完整前端测试 26 文件、266/266，通过 `lint`、`typecheck`、`build`、可访问性自动基线、理由目录及需求一致性检查；Rust release 单元测试 5/5。全项目 `npm.cmd run check` 继续在“四周试点执行计划时间无效或已过期”处停止；没有为了绿色结果伪造或刷新试点批准日期。上述自动与隔离结果不能让 A1 整体从“部分通过”改为“通过”。

同日后续 CSS 停机修复生成新内部 EXE `0C6D96DF719366F9068D435D0277C2E7BC0ED72B23634143F88396BF695DF76B`，旧 `C69C…` 证据继续归档，不移作新候选结论。当前哈希重新完成[按钮隐藏→第二实例唤醒的隔离跨日](./evidence/T01_NATIVE_HIDDEN_REVEAL_MOTION_STOP_20261015.json)及[原生关闭消息→第二实例唤醒的隔离跨日](./evidence/T01_NATIVE_CLOSE_REVEAL_MOTION_STOP_20261015.json)；同哈希的[15 日](./evidence/T01_NATIVE_HIDDEN_REVEAL_MOTION_STOP_20261015_before.png)和[16 日](./evidence/T01_NATIVE_HIDDEN_REVEAL_MOTION_STOP_20261015_after.png)画面已复看。两次均只修改隔离 WebView 的页面局部时钟、未修改 Windows 时间，找回期间未观测到旧诗卡。真实系统跨午夜、休眠／唤醒及不同缩放依然未验，A1 保持**部分通过**。

2026-10-16 Tauri 稳定升级与最小化动效修复后，同一新内部候选 `DB56F155495900B11E73CCFABCC4D99BFFC24F233AEBD0127772639811DD391D` 再次完成[隐藏→第二实例唤醒的隔离跨日](./evidence/T01_NATIVE_HIDDEN_REVEAL_TAURI212_FIX_20261016.json)：隐藏时诗卡被遮住，仅在隔离 WebView 内推进日期，恢复后显示新日诗卡，DOM 采样未见旧日诗卡可见。升级初版 `4EA661A128AB011C63495A563DBDEB0598D463B9247C14CF52D3EA1CD67E4E00` 另有[原生关闭消息跨日报告](./evidence/T01_NATIVE_CLOSE_REVEAL_TAURI212_20261016.json)与两张画面；不能把该旧哈希的关闭路径自动移作新候选结论。系统时间、真实资料与启动项未改变，A1 仍**部分通过**。

2026-10-17 自动显示焦点修正后的新内部哈希 `0921010061A8D66C551DEAC609B74063433C88B07D836B321F4EAECAF401D4AD` 又完成[隐藏→第二实例唤醒的隔离跨日](./evidence/T01_NOACTIVATE_HIDDEN_REVEAL_20261017.json)，隐藏期间不显示旧诗，恢复后使用页面局部次日并检查 DOM 观察记录。没有修改 Windows 时间，也未证明真实休眠与跨午夜；A1 继续**部分通过**。

同哈希补上[带原生窗口画面的托盘跨日复核](./evidence/T01_NATIVE_TRAY_DAY_VISUAL_20261017.json)：通过隐藏按钮进入托盘后，仅把隔离 WebView 的页面时间推进一天，再用第二实例唤醒。DOM 记录按“遮挡→遮挡→新日诗笺”变化，没有重新出现旧日诗卡；[原日画面](./evidence/T01_NATIVE_TRAY_DAY_VISUAL_20261017_before.png)与[新日画面](./evidence/T01_NATIVE_TRAY_DAY_VISUAL_20261017_after.png)已逐张查看，新日显示 10 月 18 日的重阳情境和另一首诗。静帧不能证明两张画面之间原生合成器的每一帧；真实系统跨午夜、休眠／唤醒和不同缩放仍未测，A1 继续**部分通过**。

演练预警文案修正后的新内部候选哈希 `4507FF5002D3C4E749C6F411D371D3331C30E0AC5F438353634D19FD371BC029` 又重跑[隔离托盘跨日 DOM 路径](./evidence/T01_WARNING_COPY_CANDIDATE_DAY_RECHECK_20261017.json)并通过；原窗口画面仍属于前述旧哈希，不能跨候选冒充新截图。A1 不因此完成真实系统跨日或休眠验收。

隐藏期间安全提醒复查修正后的新内部候选哈希 `3CD3094FDF09CCD36E0EA67E0C59CD5E3DF3609BAFCA0363FE62BC7F1BE0C6F0` 再跑[托盘隔离跨日回归](./evidence/T01_HIDDEN_WARNING_CANDIDATE_DAY_RECHECK_20261017.json)并通过；它只记录 DOM 状态，跨日静帧仍属于更早的哈希。真实系统跨午夜和休眠仍未验，A1 继续**部分通过**。

2026-10-19 窗口尺寸启动修正候选 `3D3856613786D6961B6BE7ECF5274F8E017DE79E1AB8CAA541F8B498A4B0ED10` 重新通过[原生托盘隐藏→第二实例唤回→页面局部次日检查](./evidence/T01_NATIVE_GLANCE_STARTUP_FIX_DAY_CROSSING_20261019.json)。诗笺先显示 10 月 19 日《观书有感》，隐藏后只保留遮挡页；仅将隔离 WebView 日期推进至 10 月 20 日，第二实例唤回耗时 146 ms，最终显示《登飞来峰》。三次 DOM 观察为“遮挡→遮挡→新日诗笺”，未观察到旧日诗卡；[原日画面](./evidence/T01_NATIVE_GLANCE_STARTUP_FIX_DAY_CROSSING_20261019_before.png)与[次日画面](./evidence/T01_NATIVE_GLANCE_STARTUP_FIX_DAY_CROSSING_20261019_after.png)已检查。隔离程序未改系统时钟、真实资料、启动项或安装状态。这只证明当前候选下该页面局部跨日路径，不证明真实午夜、休眠唤醒、不同 DPI 或每个原生合成帧，A1 保持**部分通过**。
