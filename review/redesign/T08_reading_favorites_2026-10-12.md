# T08 展开阅读、收藏与信息深度自验收

状态：**部分通过**。阅读页与收藏的主要路径已调整并实际走查；撤回内容的运行时 E2E、18 首具名内容复核尚未完成。

2026-10-15 深读文字可读性增量：隔离浏览器旧《黄鹤楼》全文画面显示出处仅 9px，展开后的注释解释 11px、背景正文 13px；这些是用户主动深入了解时需要读的内容。先把最低字号与“全部展开后低窗口仍能滚到出处”加入已有全文矩阵，旧版 12 组按预期失败（出处 9、注释 11、背景 13）。随后只改现有 CSS：背景/今日联系 14px、注释词头与解释 13px、出处 12px 且由淡字改为次级字；不改诗文原文、注释内容或展开语义。《黄鹤楼》和长词《水调歌头·明月几时有》各经浅深主题 × 横竖排 × 三档字号 12 组隔离 Chrome 155 复验，合计 24 组全文逐字一致、无页面横向溢出；三块详情全部展开后，320×260 低视口仍可滚到来源，返回栏可见。[律诗测量](./evidence/T06_BROWSER_READING_DISCLOSURES_20261015.json)、[长词测量](./evidence/T06_BROWSER_READING_LONG_CI_DISCLOSURES_20261015.json)；代表静帧：[浅色全文与来源](./evidence/T08_BROWSER_READING_SOURCE_LIGHT_20261015.png)、[深色长词注释](./evidence/T08_BROWSER_READING_LONG_CI_NOTES_DARK_20261015.png)、[低视口来源](./evidence/T08_BROWSER_READING_LONG_CI_COMPACT_SOURCE_20261015.png)。`lint`、`typecheck`、259 项测试、`build` 和 `accessibility:check` 通过。图片和测量仅证明这些隔离浏览器场景的排版与可达性，不证明具名内容审校、原生 WebView2/系统缩放或读屏；A8 继续**部分通过**。

实施：全文优先，时代背景、今日联系与词句小注改为独立可展开的语义区块，来源字段仍始终呈现，不编造具体版本。阅读页返回栏在长文滚动时保持可见。诗笺已有稳定的收藏入口；从收藏进入作品后返回收藏，从诗笺进入后返回诗笺。应用在重新取得撤回清单时，若正在阅读的收藏作品被撤回会关闭阅读并提示；收藏页不展示其原文，只给出已撤回记录及移除按钮。打开收藏详情前再次按当前可用内容检查作品。

证据：

- 浏览器预览实走“诗笺→全文→展开时代背景→收藏→返回诗笺”：展开后可访问文本，滚动时返回栏仍固定在顶部，收藏状态与收藏数同步。测试结束后撤销了测试收藏，未保留额外用户收藏。
- 隔离的 Windows 11 原生开发窗口实走《黄鹤楼》全文、展开“放回它的时代”、返回诗笺；全文八句和已展开说明在可访问树中可见，来源显示《全唐诗》。这证明该样本的原生基本路径，不代替长篇、真实撤回 E2E 或读屏验收。
- 组件测试覆盖三块按需展开标题、全文顺序、来源字段、已撤回收藏不打开原文而可移除记录。`npm.cmd run lint`、`npm.cmd run typecheck`、完整测试（24 文件、129 项）及本轮前端构建通过。
- `review/redesign/T08_content_sample_2026-10-12.md` 选取 18 首七绝、五绝、律诗、词和古诗，覆盖春节、元宵、清明、端午、七夕、中秋、重阳、除夕、雨、雪、夜和长篇。工程检查 18/18 全文、背景、今日联系、来源与注释字段非空；不把旧工程初审标志冒充人工复核。
- 2026-10-13 补充 `src/App.test.ts` 的应用级隔离反例：从真实 App 组件进入已收藏作品阅读页后，把该作品放进有效的本地撤回清单并触发应用原有的定时检查；阅读立即关闭，收藏页不再呈现原文，只留下可移除记录，移除后本地收藏也同步清空。另对当日正在展示的作品做同样处理：诗笺原文消失、每日状态记为 `content-withdrawn`，界面提供“换一首已核验内容”，更换后记录的新作品不等于撤回作品。测试用隔离 happy-dom、本地存储与离线天气；这是 App 逻辑链路证据，不是生产网关、签名清单、实际 WebView2 或原生 SQLite 的端到端验收。

仍需完成：

- 18 首按可核查点校本进行具名人工审校；来源字段目前有《全唐诗》等总集名称但未给具体版本卷次，应保持如实呈现，不自动补造。
- 在新原生候选上用实际撤回清单触发“收藏作品正在阅读时被撤回”、列表移除与数据库同步；上述模拟 App 测试不能替代完整端到端门禁。
- 长篇、无注释作品、键盘与读屏在原生 WebView2 下的焦点回退路径待 T09 测试。

A8 因上述条件仍为**部分通过**，不把 T08 记录当作发布签收。

## 2026-10-14 隔离浏览器收藏找回与排序回归

本批只补 T08 的“诗笺→全文→收藏→返回诗笺→重新载入→从收藏找回→再读→取消收藏→返回收藏→返回诗笺”连续路径。使用 `scripts/test-redesign-browser-storage.mjs --favorites-audit --date=2026-06-01 --poem-id=cui-hao-huang-he-lou --favorites-report=T08_BROWSER_FAVORITES_FLOW_VERIFIED_20261014.json --capture`，以独立临时浏览器资料、Chrome 155、受控上海本地日期和隔离离线天气运行；已有《元日》旧收藏作保留对照。模拟/隔离输入不代表真实当地天气，也没有启动可见 WeatherPoem EXE、修改真实系统启动项或用户资料。

首次加上“重新载入后仍应排在收藏首位”的反例时，发现浏览器存储在新增《黄鹤楼》后留下 `[旧诗, 新诗]`，而应用当下显示 `[新诗, 旧诗]`；刷新后收藏列表顺序突变。`src/services/persistence.test.ts` 新测试先红：预期 `[newer-poem, older-poem]`，实际 `[older-poem, newer-poem]`。随后仅调整浏览器存储新增收藏的插入位置，已有收藏重复写入不重排、取消收藏仍删除；定向 6/6 转绿，未改 SQLite 结构、作品内容或收藏视图样式。

修复后同一隔离浏览器会话的 10 个阶段均通过：新收藏在阅读页、诗笺和持久化数据一致；页面重新载入后仍是收藏列表第一项；从收藏重开《黄鹤楼》时全文逐字匹配、返回标签为“我的收藏”；取消后列表只保留旧《元日》，诗笺收藏数由 2 回到 1。每次面板转换后的焦点均落在新面板主区域。320×260 低视口滚到阅读页末尾时，固定返回按钮与文本来源都在可视区域，页面无横向溢出。原始逐阶段状态与尺寸见 [T08 浏览器报告](./evidence/T08_BROWSER_FAVORITES_FLOW_VERIFIED_20261014.json)。

已逐张复看六张无遮挡静帧：

- [收藏前小诗笺](./evidence/T08_BROWSER_FLOW_card_before_20261014.png)、[阅读页已收藏](./evidence/T08_BROWSER_FLOW_reading_collected_20261014.png)、[刷新后收藏列表](./evidence/T08_BROWSER_FLOW_favorites_list_20261014.png)；
- [低视口全文末尾](./evidence/T08_BROWSER_FLOW_reading_compact_bottom_20261014.png)、[取消后收藏列表](./evidence/T08_BROWSER_FLOW_favorites_after_remove_20261014.png)、[取消后小诗笺](./evidence/T08_BROWSER_FLOW_card_after_remove_20261014.png)。

本批 `npm.cmd run lint`、`typecheck`、全量 `test`（26 文件、198 项）、`build` 与原浏览器存储路径均通过。浏览器检查只证明这首律诗、该逻辑视口和本地存储路径，不证明原生 WebView2/SQLite 的返回焦点、读屏、真实撤回清单或 Windows 系统缩放；18 首内容的原文与解释仍须具名人员复核。因此 **A8 继续部分通过**，下一项应在获准的隔离原生候选上验收藏阅读遇真实撤回的数据库同步与焦点，再由 H1 进行内容审核。

## 2026-10-15 当前改版的自动内容撤回演练证据

全项目 `npm.cmd run check` 原先在旧 `output/WeatherPoem_0.2.0_CONTENT_WITHDRAWAL_DRILL.json` 的 30 天时效门槛处停止。该旧报告的 SHA-256 `10570C1FA4AB038E82F77ABA14E8E26CBEB373029DA691BE8E5E3EAA0096513E` 在本批前后完全一致，未改时间戳、未覆盖旧候选证据。为当前改版另生成 [T08 独立自动演练报告](./evidence/T08_CONTENT_WITHDRAWAL_DRILL_20261015.json)；报告绑定当前内容目录、撤回服务和模式文件哈希，验证远端模拟清单接受、只请求版本参数、缓存写入、离线保留、低版本及同版本冲突拒绝、候选排除和当前阅读校正。生成只用本地 Vite SSR、内存存储与模拟 `fetch`，不连接生产网关、不打开可见 EXE；同名新报告拒绝覆盖。旧报告仍可由原命令单独核查，但它目前因过期而失败；当前分支的 `npm.cmd run check` 改为校验这份新报告。

`npm.cmd run content:withdrawal:redesign:check` 已通过，缺报告时先红、真实新报告后转绿。全项目 `npm.cmd run check` 因此越过撤回演练阶段，但随后在“四周试点执行计划已过期”处停止，不能称整体验证通过。报告自身明确 `signedManifestVerified`、`productionGatewayTested`、`liveClientDrill`、`namedOperatorSignoff` 均为 `false`；A8 的新原生候选和真实撤回端到端、A10/H1 人工门禁仍保持未验。

2026-10-15 补一条获准的隔离原生“隐藏后内容撤回”反例：Windows 11 WebView2 运行内部 EXE `C69C991F182DE286623F9DBA379C92FA8DA7B597ACB28886D8FFF609F525A015`，先显示一首诗，隐藏窗口后在**临时测试资料**中写入该作品的同版本撤回缓存，再恢复窗口。修复后的界面先显示校验遮挡，随后只显示“今日内容正在校正”；DOM 变化中没有重新露出已撤回诗卡，校正页也不含原诗题，隔离 SQLite 的每日状态已写成 `content-withdrawn` 且作品 ID 一致。原始记录见[具数据库核对的原生报告](./evidence/T08_NATIVE_WITHDRAWAL_REVEAL_VERIFIED_20261015.json)，使用受控离线天气和本地模拟缓存，不代表生产签名清单、真实网关或具名人员操作。A8 继续**部分通过**。

同哈希的[可视复测报告](./evidence/T08_NATIVE_WITHDRAWAL_CAPTURED_20261015.json)留存[撤回前诗笺](./evidence/T08_NATIVE_WITHDRAWAL_CAPTURED_20261015_before.png)与[撤回后校正页](./evidence/T08_NATIVE_WITHDRAWAL_CAPTURED_20261015_after.png)。已逐张检查：校正页不显示原诗题、诗句或伪装成正常推荐的理由，“换一首已核验内容”可见；静帧不能代替真人阅读与生产网关的端到端签收。

动效停机修复后，当前内部 EXE 哈希改为 `0C6D96DF719366F9068D435D0277C2E7BC0ED72B23634143F88396BF695DF76B`。再次以专用临时资料执行[隐藏后模拟撤回→第二实例唤醒报告](./evidence/T08_NATIVE_WITHDRAWAL_MOTION_STOP_20261015.json)，DOM 变化中没有已撤回诗卡，校正页未泄露原诗题，SQLite 每日状态为 `content-withdrawn` 且 ID 对应；[当前哈希校正页](./evidence/T08_NATIVE_WITHDRAWAL_MOTION_STOP_20261015_after.png)已查看。它仍是本地模拟缓存，不是生产签名清单或具名撤回演练；A8 保持**部分通过**。

2026-10-16 升级依赖及修复最小化动效后的新内部候选 `DB56F155495900B11E73CCFABCC4D99BFFC24F233AEBD0127772639811DD391D`，用临时资料再次完成[隐藏后模拟撤回→第二实例唤醒](./evidence/T08_NATIVE_WITHDRAWAL_TAURI212_FIX_20261016.json)：校正页不泄露已撤回诗题，SQLite 每日状态与撤回作品 ID 对应，DOM 采样未见旧诗卡复现。升级初版 `4EA661A128AB011C63495A563DBDEB0598D463B9247C14CF52D3EA1CD67E4E00` 的[校正页静帧](./evidence/T08_NATIVE_WITHDRAWAL_TAURI212_20261016_after.png)已人工查看，文字与主要按钮可读；该画面不代表新候选的逐页视觉签收，也不证明生产撤回网关、签名或具名内容审核。A8 继续**部分通过**。

2026-10-17 自动显示焦点修正后的内部哈希 `0921010061A8D66C551DEAC609B74063433C88B07D836B321F4EAECAF401D4AD` 再次通过[隐藏后模拟撤回→第二实例唤醒](./evidence/T08_NOACTIVATE_WITHDRAWAL_20261017.json)：原诗卡未复现，校正页不含撤回作品题名，隔离 SQLite 状态相符。仍是本地模拟缓存，不是生产签名清单或具名内容审核；A8 保持**部分通过**。

同哈希再留[带原生窗口画面的托盘撤回复核](./evidence/T08_NATIVE_TRAY_WITHDRAWAL_VISUAL_20261017.json)：隐藏期间只向临时测试资料写入当前作品的模拟撤回缓存，再由第二实例唤醒；DOM 记录仍为“遮挡→遮挡→内容校正”，隔离 SQLite 状态为 `content-withdrawn`。已查看[撤回前诗笺](./evidence/T08_NATIVE_TRAY_WITHDRAWAL_VISUAL_20261017_before.png)与[校正后画面](./evidence/T08_NATIVE_TRAY_WITHDRAWAL_VISUAL_20261017_after.png)，后者只有校正说明和“换一首已核验内容”，没有旧诗题或诗句。这补足可视证据，不证明真实生产网关、签名清单、真人托盘操作或合成器中间每一帧；A8 继续**部分通过**。

演练预警文案修正后的新内部候选哈希 `4507FF5002D3C4E749C6F411D371D3331C30E0AC5F438353634D19FD371BC029` 又重跑[隔离托盘撤回 DOM/SQLite 路径](./evidence/T08_WARNING_COPY_CANDIDATE_WITHDRAWAL_RECHECK_20261017.json)并通过；前述可视画面仍绑定旧哈希，新哈希未取得对应托盘中间帧或真人操作证据。A8 保持**部分通过**。

隐藏期间安全提醒复查修正后的新内部候选哈希 `3CD3094FDF09CCD36E0EA67E0C59CD5E3DF3609BAFCA0363FE62BC7F1BE0C6F0` 又通过[托盘隔离撤回回归](./evidence/T08_HIDDEN_WARNING_CANDIDATE_WITHDRAWAL_RECHECK_20261017.json)：遮挡期间模拟撤回，找回后只进入校正页，SQLite 状态一致。它不是生产网关/签名清单或人工内容审查，A8 继续**部分通过**。

2026-10-18 补查收藏的写入失败与重复点击：此前 `toggleFavorite` 的存储异常会成为 Vue 未处理错误，界面没有告知用户；同一渲染周期快速点击两次还会向浏览器存储重复写入。先在 App 级加入两条失败反例，旧版分别出现无提示／未处理拒绝和两次写入；随后只在现有收藏路径加入操作中保护、失败提示和重试。诗笺、全文及收藏列表的收藏/移除按钮在保存期间禁用并标记 `aria-busy`；保存失败时原状态不变，按钮恢复。浏览器存储新增、取消失败的重试测试及三个组件忙碌态测试通过。未改作品原文、推荐排序或收藏表结构。

新建且未安装的内部 EXE `.work/redesign-favorite-save-20261018/release/weatherpoem.exe`，SHA-256 `9E96FA84DCCA99F7C24D1616FDF1609547A9CFDF4EA323C0DE8F7E807F4CF4F4`。[原生故障与主路径报告](./evidence/T08_NATIVE_FAVORITE_FAILURE_RETRY_20261018.json)使用独立临时 SQLite/WebView2 资料，只在该库的 `favorites` 表插入／删除前设置一次明确标记的测试触发器：两次故障均提示失败、保留原状态并使按钮可重试；撤销触发器后再次操作分别得到 SQLite 行数 `0→1`、`1→0`。其间原生诗笺→全文→收藏列表→再读→返回收藏路径保持同一首《九月九日忆山东兄弟》，返回标签正确；同日托盘找回展示事件不增加。已逐张查看[新增失败诗笺](./evidence/T08_NATIVE_FAVORITE_FAILURE_RETRY_20261018_favorite_add_failed.png)、[收藏后全文](./evidence/T08_NATIVE_FAVORITE_FAILURE_RETRY_20261018_favorite_reading.png)、[收藏列表](./evidence/T08_NATIVE_FAVORITE_FAILURE_RETRY_20261018_favorite_list.png)、[移除失败列表](./evidence/T08_NATIVE_FAVORITE_FAILURE_RETRY_20261018_favorite_remove_failed.png)和[重试完成诗笺](./evidence/T08_NATIVE_FAVORITE_FAILURE_RETRY_20261018_favorite_removed_card.png)：提示可读、原诗和主要操作无裁切。`lint`、`typecheck`、完整自动测试 279/279、构建通过。本批原生证据是临时数据库的人为故障，不是用户真实 I/O 故障、生产撤回网关或具名内容审核；当前哈希的性能、全设备与发行门禁仍未完成，A8 保持**部分通过**。

## 2026-10-19 当前候选收藏故障与找回复核

以当前未签名、未安装内部候选 `.work/redesign-accessibility-focus-ring-20261019/release/weatherpoem.exe` 执行隔离原生复测，SHA-256 为 `7BFC5F340E992D15D95BE56DAF0C356A7BA261C0B9A8B3BF795B59E5310FF627`。使用临时 WebView2 profile 与 SQLite，在临时 `favorites` 表上注入一次明确的插入/删除失败；系统时钟、启动项、真实用户资料和安装状态均未触碰，天气保持离线。原始报告：[T08 当前候选收藏失败/重试报告](./evidence/T08_NATIVE_GLANCE_FOCUS_FAVORITE_FAILURE_RETRY_20261019.json)。

新增失败后界面提示“收藏未能保存，请再试一次”，按钮恢复可用且仍为未收藏；撤销故障后重试，进入同一首《观书有感》的全文、收藏列表并可从列表再读，返回来源标签为“我的收藏”。移除失败时提示“取消收藏未能保存，请再试一次”，作品仍留在列表；再次重试后回到诗笺显示收藏数 0、`aria-pressed=false`，SQLite 收藏行数为 0。托盘隐藏/唤回后诗笺恢复，展示事件 `1→1`，没有因同日找回重复计为新展示。报告绑定上述候选哈希，结果为 `passed`。

逐张查看当前候选截图：[新增失败提示](./evidence/T08_NATIVE_GLANCE_FOCUS_FAVORITE_FAILURE_RETRY_20261019_favorite_add_failed.png)、[全文阅读](./evidence/T08_NATIVE_GLANCE_FOCUS_FAVORITE_FAILURE_RETRY_20261019_favorite_reading.png)、[收藏列表](./evidence/T08_NATIVE_GLANCE_FOCUS_FAVORITE_FAILURE_RETRY_20261019_favorite_list.png)、[移除失败后仍保留条目](./evidence/T08_NATIVE_GLANCE_FOCUS_FAVORITE_FAILURE_RETRY_20261019_favorite_remove_failed.png)、[重试后的诗笺](./evidence/T08_NATIVE_GLANCE_FOCUS_FAVORITE_FAILURE_RETRY_20261019_favorite_removed_card.png)。两种错误提示在截图中可辨，收藏列表保留/最终移除状态一致，画面未见按钮裁切。此测试只模拟 SQLite 语句失败，不代表真实磁盘满、权限、数据库损坏或生产撤回端到端；A8 继续**部分通过**，不能以此替代 15–20 首具名内容复核、读屏及系统矩阵。

## 2026-10-19 规则 1.2.4 候选稳态收藏路径复验

在当前未签名、未安装内部候选 `.work/redesign-recommendation-124-20261019/release/weatherpoem.exe` 上再次运行隔离 WebView2/SQLite 全路径，EXE SHA-256 `3759CE59650FDB6681FA55BAD25542F3DA501D22B4832A40ECE3F4ED931712A4`；报告绑定的测试器 `scripts/test-redesign-native-reveal.mjs` SHA-256 为 `8D5357B4846A2012E1887B89ADF18E0DDCE499C22C7FF5D1D8EE471CBE4017F7`。[结构化报告](./evidence/T08_NATIVE_RULE124_FAVORITE_FAILURE_RETRY_STEADY_20261019.json)记录初始离线诗为《使至塞上》，同日隐藏/唤回 DOM 为“核对遮挡→原诗”，展示事件数量 `1→1`。

在临时 `favorites` 表上分别注入插入和删除触发器：新增失败时提示“收藏未能保存，请再试一次”、`aria-pressed=false`、SQLite 行数仍 0；取消失败时提示“取消收藏未能保存，请再试一次”、按钮恢复可用、列表条目仍在且 SQLite 行数仍 1。移除触发器后重试，新增成功、全文显示同一作品并可返回列表再读；取消重试后返回诗笺为 `aria-pressed=false`、收藏数 0、SQLite 行数 0。稳态终图等待成功 toast 消失后再采集，窗口 `392×407`，操作行完全位于诗笺卡片内，文档无水平溢出。

已检查[失败新增提示](./evidence/T08_NATIVE_RULE124_FAVORITE_FAILURE_RETRY_STEADY_20261019_favorite_add_failed.png)、[全文](./evidence/T08_NATIVE_RULE124_FAVORITE_FAILURE_RETRY_STEADY_20261019_favorite_reading.png)、[收藏列表](./evidence/T08_NATIVE_RULE124_FAVORITE_FAILURE_RETRY_STEADY_20261019_favorite_list.png)、[失败移除后保留](./evidence/T08_NATIVE_RULE124_FAVORITE_FAILURE_RETRY_STEADY_20261019_favorite_remove_failed.png)与[稳态取消后的诗笺](./evidence/T08_NATIVE_RULE124_FAVORITE_FAILURE_RETRY_STEADY_20261019_favorite_removed_card.png)。首轮报告 `T08_NATIVE_RULE124_FAVORITE_FAILURE_RETRY_20261019.json`也通过状态门禁，但最终截图仍含成功 toast；已保留首轮证据，并用稳态报告补足可视验收。测试只模拟隔离 SQLite 语句失败，不证明真实磁盘满、权限/设备 I/O 或生产签名撤回链路；A8 继续**部分通过**，具名文化审核、真实屏幕阅读器和设备矩阵未完成。
