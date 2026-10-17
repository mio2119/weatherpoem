# T05 小诗笺信息架构与入口自验收

状态：**部分通过**。信息层级、动态高度和三条主要路径已实现，长文本及节日/安全状态已有隔离浏览器矩阵，演练预警另有原生 WebView2 浅/深色画面；真实安全提醒动态进入、完整原生矩阵及系统缩放仍不能签为通过。

实施范围：`src/components/PoemCard.vue`、`src/components/FavoritesPanel.vue`、`src/App.vue`、`src/services/desktop.ts`、`src/styles.css` 及组件测试。首屏仅保留日期/可信情境、题名作者、完整节选、一句理由和继续读/收藏/收起；换诗与不贴合在“更多”中。收藏数是复访入口，返回目标按来源为今日诗笺或设置。

已核对的事实：

- 浏览器预览的逻辑视口 392×320 下，《黄鹤楼》节选把操作区挤出可见范围。组件测得完整内容需约 394 高；设计因此通过 `ResizeObserver` 请求增高，桌面实现将目标限于当前显示器工作区。预览在 392×394 时所有主操作可见，网页无横向/纵向溢出。展开“更多”需约 430 高，392×430 预览中两项次级操作可见。
- 浅色和深色预览均看到诗句优先、理由与操作次之；离线文案为“天气未更新”，没有把旧天气说成实时天气。浏览器中点击继续读可到全文再回诗笺；点击收藏数可进入收藏再返回诗笺。收藏返回文案错误在此轮被发现并修正。
- `npm.cmd run lint`、`npm.cmd run typecheck`、完整测试（21 文件、119 项）及前端构建通过。组件测试覆盖节选完整性、情境、理由、更多操作及缓存/不可用天气。

尚未完成的 A5 条件：

- 长题名、最长节选、最长合法理由、节日和安全状态尚未形成可复现的真实截图矩阵；不能用当前单一样例外推全部内容。
- 原生 Windows 11 隔离开发预览现已启动：补齐 Tauri 窗口权限、移除桌面应用不使用的 `cdylib` 后，竖排《黄鹤楼》诗笺约 404×513，横排约 404×407；可访问树有“继续读／收藏／收起／更多”四项。桌面外部悬浮提示遮住了截图下部，故这次观察不能作为所有按钮均视觉可见的完整截图证据，也不能替代长文本与多 DPI 验收。
- 低高度工作区内若内容超出可用高度，当前可滚动降级还须用真实 Windows 验证；不能宣称所有按钮始终露出。

旧 0.2.0 发布 EXE 和清单未重建、未替换。本记录是新分支源码的自验收，不是旧候选的发布证明。

2026-10-14 补充长题名的真实浏览器排版检查：为 `scripts/test-redesign-browser-storage.mjs` 增加可选 `--layout-audit --date=2026-06-01 --poem-id=fan-cheng-da-si-shi-tian-yuan-mei-zi` 模式，以隔离无界面 Chrome 154 和当前源码构建检查《四时田园杂兴·梅子金黄杏子肥》。先把题名与作者分成稳定的两行，将推荐理由从 12px 提至 13px，主要操作及次级操作的字从 11–12px 提至 12–13px；未改变主诗句、推荐或窗口状态逻辑。392×430 横排中内容要求 429px，主操作底部在 404px；展开“更多”要求 466px，在 392×470 中两项操作可见。320×260 低工作区没有横向溢出，主操作可滚动到达。浏览器静态帧为 `evidence/T05_BROWSER_LONG_TITLE_HORIZONTAL_20261014.png`。这只覆盖一个长题名和浏览器逻辑视口，不等于最长理由、全部节日/安全状态或原生 WebView2 多缩放通过；A5 仍为**部分通过**。

2026-10-14 增补真实诗库边界矩阵：从当前 120 首统计得最长题名 14 字，最长节选是苏轼《浣溪沙·游蕲水清泉寺》48 字；无实时天气的已测情境中，范成大《四时田园杂兴·昼出耘田夜绩麻》同时覆盖 14 字题名、32 字节选和 34 字完整理由。另取五言律诗《月夜忆舍弟》检查短行分列。`scripts/test-redesign-browser-storage.mjs --matrix-audit` 在隔离无界面 Chrome 155 中逐首检查浅/深色 × 横/竖排 × 小/中/大字号共 12 组，三首合计 36 组；每组均对照原节选逐字一致、理由 6–40 字、诗文在纸面内、392px 宽无横向溢出、按内容建议高度可见四项主操作，以及 320×260 低工作区滚动后主操作可达。三次命令均返回 passed；原始测量报告显示建议窗口高度范围分别为 416–571、416–571、356–502 逻辑像素：

- [最长节选测量](./evidence/T05_BROWSER_MATRIX_MAX_EXCERPT_20261014.json)；代表静帧：[浅色横排](./evidence/T05_BROWSER_MAX_EXCERPT_LIGHT_HORIZONTAL_20261014.png)、[深色竖排](./evidence/T05_BROWSER_MAX_EXCERPT_DARK_VERTICAL_20261014.png)。
- [长题名与长理由测量](./evidence/T05_BROWSER_MATRIX_LONG_TITLE_REASON_20261014.json)；代表静帧：[浅色竖排](./evidence/T05_BROWSER_LONG_TITLE_MAX_REASON_LIGHT_VERTICAL_20261014.png)、[深色横排](./evidence/T05_BROWSER_LONG_TITLE_MAX_REASON_DARK_HORIZONTAL_20261014.png)。
- [五言样本测量](./evidence/T05_BROWSER_MATRIX_FIVE_CHAR_20261014.json)；代表静帧：[浅色横排](./evidence/T05_BROWSER_FIVE_CHAR_LIGHT_HORIZONTAL_20261014.png)、[深色竖排](./evidence/T05_BROWSER_FIVE_CHAR_DARK_VERTICAL_20261014.png)。

逐张观察这些静帧，题名、作者、诗句、理由和底部操作没有重叠或裁切；竖排样本确实更高，不应以“更省空间”宣传。脚本使用独立临时浏览器资料，未启动可见 WeatherPoem EXE、修改系统缩放或接触真实用户资料。本批只证明这三首及所列浏览器组合；节日/安全情境、所有内容与真实 WebView2、读屏、多 DPI 仍未覆盖，A5 保持**部分通过**。原生系统矩阵须在获准的隔离环境中另行验收。

对规则/远端服务允许的 40 字理由上限，另在同一长题名作品上注入**仅用于排版的隔离文本**，绝不冒充真实推荐文案。浅/深色 × 横/竖排 × 三档字号再跑 12 组，[原始测量](./evidence/T05_BROWSER_MATRIX_40_REASON_20261014.json)均为完整 40 字、无横向溢出、建议高度下四项主操作可见，低工作区可滚动到达。逐张检查 [浅色竖排](./evidence/T05_BROWSER_SYNTHETIC_40_REASON_LIGHT_VERTICAL_20261014.png) 与 [深色横排](./evidence/T05_BROWSER_SYNTHETIC_40_REASON_DARK_HORIZONTAL_20261014.png)，理由两行完整、与按钮之间有清楚分隔。至此本批浏览器布局检查共 48 组（36 组真实规则理由 + 12 组隔离字数边界）；这只说明容纳能力，不证明任何 AI 理由内容质量，也不改变 A5 的部分通过状态。

同日节日/安全状态隔离浏览器检查：固定北京时间 2026-06-19（真实端午节）和当前已收录的文秀《端午》，在断开实际天气请求的独立资料下，浅/深色诗笺均显示端午节优先、天气未更新及 `festival` 诗境，理由确实谈端午；没有把作品里的天气当当地实况。另注入**明确标注为隔离演练、并非真实预警/撤回**的缓存数据，检查官方来源样式、基础天气提示、当前作品撤回、全部内容暂停四种安全/校正状态。五种状态 × 浅/深色共 10 个场景，每个检查 392×720 与 320×260 浏览器视口；安全页没有普通诗文或动态诗境，超长预警在低视口可滚到免责声明，撤回替换按钮在低视口完整可见并可由 Tab 一次到达。详情与每组原始尺寸、字号、滚动及焦点记录见 [报告](./evidence/T05_BROWSER_SCENE_SAFETY_FINAL_20261014.json)。

第一轮静帧暴露安全说明/来源及校正正文仅 9–12px，尽管几何不裁切，实际阅读吃力；先在新浏览器检查里为正文与来源设置最低字号反例，现状返回失败，再仅修改 `src/styles.css`：预警引导和校正正文 14px、预警正文 13px、预警来源及免责声明 11px、校正辅助文字 12px。相同 10 场景复验通过。逐张观察 [节日浅色](./evidence/T05_BROWSER_STATE_FESTIVAL_LIGHT_TOP_20261014.png)、[节日深色](./evidence/T05_BROWSER_STATE_FESTIVAL_DARK_TOP_20261014.png)、[长预警浅色首屏](./evidence/T05_BROWSER_STATE_OFFICIAL_WARNING_LIGHT_TOP_20261014.png)、[长预警浅色低视口底部](./evidence/T05_BROWSER_STATE_OFFICIAL_WARNING_LIGHT_COMPACT_BOTTOM_20261014.png)、[长预警深色首屏](./evidence/T05_BROWSER_STATE_OFFICIAL_WARNING_DARK_TOP_20261014.png)、[撤回浅色](./evidence/T05_BROWSER_STATE_WITHDRAWN_LIGHT_TOP_20261014.png)及[全部暂停深色](./evidence/T05_BROWSER_STATE_SUSPENDED_DARK_TOP_20261014.png)，正文比基线易辨、没有遮挡。其余五张静帧同目录保留，报告标明它们均属于模拟内容。

上述验证只覆盖隔离 Chrome 155 预览及这些指定场景。没有启动可见 WeatherPoem EXE、修改系统启动项或显示设置；它不能证明真实预警网关、原生 WebView2、Windows 缩放、读屏、动态进入预警时的面板优先级或真人审美。A5 仍为**部分通过**；A7 的情境美术与停机、A9 的原生设备矩阵也不能由本批代签。

2026-10-17 追加原生安全画面：同一未安装内部候选 `0921010061A8D66C551DEAC609B74063433C88B07D836B321F4EAECAF401D4AD` 用临时 SQLite 预置当天《宿建德江》，再由应用内 `official-warning` **隔离演练**场景启动。浅/深色均只显示 `role=alert` 的“今日诗笺暂缓展示”、模拟暴雨说明和来源，旧诗题不在 DOM，每日状态为 `alert-suppressed` 且保留先前作品 ID；本次 420×580 原生窗口内免责声明完整可见。[原始浅色报告](./evidence/T05_NATIVE_WARNING_LIGHT_20261017.json)与[深色报告](./evidence/T05_NATIVE_WARNING_DARK_20261017.json)以及画面原件均保留。逐张查看发现演练数据把地区写成“北京北京”，且页尾错称“授权网关转发”；这两张画面**不计入文案签收**，更不是真实气象预警。

为防此类误导，先在天气数据和预警组件加入两条失败反例，再只改隔离演练地区拼接与专属说明：北京只显示一次；开头和页尾明确“隔离演练、不是真实预警、未连接真实预警网关”，正常官方预警与基础天气提示文案保持原分支。定向测试先 2 失败、修复后 33/33；同时并行执行多项检查时，首次全量测试有两条无关 SQLite 用例超过原有 5 秒门槛，未调宽门槛，独立重跑完整测试为 269/269；`lint`、`typecheck`、`build` 与可访问性自动基线通过。新建而未覆盖旧候选的内部 EXE `.work/redesign-warning-copy-20261017/release/weatherpoem.exe`，SHA-256 `4507FF5002D3C4E749C6F411D371D3331C30E0AC5F438353634D19FD371BC029`。在此哈希上[浅色报告](./evidence/T05_NATIVE_WARNING_COPY_FIXED_LIGHT_20261017.json)与[深色报告](./evidence/T05_NATIVE_WARNING_COPY_FIXED_DARK_20261017.json)均通过，已逐张查看[浅色原生画面](./evidence/T05_NATIVE_WARNING_COPY_FIXED_LIGHT_20261017_warning_top.png)和[深色原生画面](./evidence/T05_NATIVE_WARNING_COPY_FIXED_DARK_20261017_warning_top.png)：地区、演练标记、来源与免责声明清楚，没有普通诗卡或诗境动效冒出。该启动时的受控演练不证明真实授权网关、运行中预警到来或托盘隐藏期间天气预警突然变化的合成器帧、长预警低工作区、读屏及系统缩放；A5 继续**部分通过**。

2026-10-17 继续检查“同日诗笺隐藏期间新出现安全提醒”。源码审查发现找回时原先只复核日期与内容撤回，若当天作品仍在，**不重新查询天气**。先加入 App 级失败反例：诗笺隐藏后注入新的安全结果，焦点找回应持续遮挡直至决定，旧实现只调用一次天气服务，测试失败。再用旧内部 EXE `4507FF…`、独立临时 SQLite/WebView2 资料、只在该进程阻断 Open-Meteo 域名、隐藏时注入明示非真实的有效官方样式**缓存**提醒，原生第二实例找回；[失败诊断原文](./evidence/T05_HIDDEN_WARNING_OLD_CANDIDATE_RED_20261017.md)记录旧版从遮挡直接回到《秋词》，25 秒内没有进入提醒页。测试既不修改系统网络/时间，也没有向真实预警网关发请求。

修复仅在被隐藏的现有诗笺找回时额外查一次天气；查到需要压过诗笺的安全信息，就先写入 `alert-suppressed`，清除当前诗/阅读页，保持遮挡直至进入安全页。没有新提醒则保留当天作品与原有理由，不重复记展示；复查异常则显示错误页，不提前放出旧诗。单元测试覆盖诗笺、全文阅读与失败状态，未修改已有的正常推荐排序或内容撤回逻辑。新建而不覆盖旧候选的未安装内部 EXE `.work/redesign-hidden-warning-20261017/release/weatherpoem.exe`，SHA-256 `3CD3094FDF09CCD36E0EA67E0C59CD5E3DF3609BAFCA0363FE62BC7F1BE0C6F0`。[隔离安全提醒原生报告](./evidence/T05_NATIVE_HIDDEN_WARNING_REVEAL_20261017.json)通过：DOM 观察顺序为“遮挡→遮挡→提醒”，没有旧诗卡；临时 SQLite 状态为 `alert-suppressed`，作品 ID 保留，第二实例找回耗时约 `1183ms`。已逐张查看[原诗笺](./evidence/T05_NATIVE_HIDDEN_WARNING_REVEAL_20261017_before.png)与[安全页](./evidence/T05_NATIVE_HIDDEN_WARNING_REVEAL_20261017_after.png)，后者明确标记隔离演练、无原诗题和诗句。[无新增提醒的同日找回报告](./evidence/T05_NATIVE_SAME_DAY_RECOVERY_20261017.json)也通过：仍是《秋词》，展示事件 `1→1`，本次受控离线场景耗时约 `105ms`。新哈希的[启动时安全页回归](./evidence/T05_HIDDEN_WARNING_CANDIDATE_STARTUP_RECHECK_20261017.json)通过。`lint`、`typecheck`、全量测试 272/272、`build` 通过。

这关闭的是**隔离缓存提醒在托盘隐藏期间到来**的可复现缺陷；没有测试生产授权网关实时推送、真实官方预警签名/时序、原生合成器的每一帧、长预警在低工作区、多 DPI、读屏和真人理解。复查会增加一次天气查询，真实在线/离线设备上的找回耗时仍需 T09 测量。当时遮挡文案仍是“正在择取今日诗句”，对仅做安全复查的同日找回不够准确；下述新批次已修正。A5 继续**部分通过**，旧哈希的性能/画面报告不得转记给新哈希。

2026-10-17 文案复核批次：先加 App 组件失败反例，证明同日找回的遮挡页误称“正在择取今日诗句”；修复后只在 `revealPending` 的回显核对阶段显示“正在核对今日内容与安全信息”，初次推荐加载仍用原文案，两种分支均有单测。新建未安装、未覆盖前一候选的内部 EXE `.work/redesign-reveal-copy-20261017/release/weatherpoem.exe`，SHA-256 `6D15856C4A8F10706A76A54C5F53EC1F1AC25F433EF1F31E3B15B3A8D2C5B32F`。[隔离提醒报告](./evidence/T05_NATIVE_REVEAL_COPY_MASK_20261017.json)通过，第二实例找回时取得真实可见的[遮挡帧](./evidence/T05_NATIVE_REVEAL_COPY_MASK_20261017_reveal_mask.png)：新文案可读，没有诗卡或提醒正文；随后[安全页](./evidence/T05_NATIVE_REVEAL_COPY_MASK_20261017_after.png)仅显示标明非真实预警的演练信息，DOM 顺序仍为“遮挡→遮挡→提醒”，临时 SQLite 为 `alert-suppressed`，本次找回约 `1179ms`。两张原生画面已逐张查看。[同哈希无提醒找回报告](./evidence/T05_NATIVE_REVEAL_COPY_SAME_DAY_20261017.json)亦通过：仍为《秋词》，展示事件 `1→1`，受控场景约 `104ms`。`lint`、`typecheck`、全量测试 273/273、`build` 通过。两份报告均使用临时资料，不改系统时间、实际用户资料、启动项或安装状态。新哈希仅覆盖这些场景；生产网关、合成器逐帧、长预警低工作区、多 DPI、读屏、真实在线/离线设备找回耗时与真人理解仍未测，A5 保持**部分通过**。
