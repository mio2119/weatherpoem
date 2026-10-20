# T06 横竖排与字号自验收

状态：**部分通过**。横/竖排、三档诗句字号、设置持久化和窄视口滚动已实现；原生 WebView2 已覆盖四类正式作品及设置页逐档保存，但读屏、特殊标点及真实 Windows 缩放矩阵仍待验。

2026-10-20 最新内部 EXE `D68E286A2C5F2262079078921804134917CBB8C6836E1AB2D8036307E8F1325B` 的[深色长词与键盘隔离报告](./evidence/T06_NATIVE_DARK_KEYBOARD_RESETINLINE_20261020.json)补当前哈希：苏轼《水调歌头·明月几时有》竖排诗笺与全文、横排切换，小/中/大诗笺宽度 `392/456/520px`，字号逐档保存并同资料重启保留竖排、大字号及大窗。六站合成 Tab 中，返回、收藏、排版、横向滚动诗文和两项折叠说明均有可见暖色焦点框；说明可以展开。已查看[深色诗笺](./evidence/T06_NATIVE_DARK_KEYBOARD_RESETINLINE_20261020_glance.png)、[竖排全文](./evidence/T06_NATIVE_DARK_KEYBOARD_RESETINLINE_20261020_reading_vertical.png)、[焦点与展开](./evidence/T06_NATIVE_DARK_KEYBOARD_RESETINLINE_20261020_keyboard_focus_summary.png)及[重启诗笺](./evidence/T06_NATIVE_DARK_KEYBOARD_RESETINLINE_20261020_restart_vertical.png)：诗文和操作未见遮挡，长词全文采用独立滚动，不强塞进首屏。测试预选正式目录作品，但不代表实时推荐算法会选中它；CDP 合成按键不等于实体键盘/读屏，多 DPI、更多体裁和真人阅读仍缺，A6 **部分通过**。

2026-10-20 当前内容 `2026.10.1` 未安装内部 EXE `402FE0C7…` 的[苏轼长词完整原生路径](./evidence/T06_NATIVE_CONTENT101_LONG_POEM_MATRIX_20261020.json)通过：竖排诗笺到竖排全文再切横排，全文逐字保持一致；长词竖排框/内容宽 `483/716px`，合成方向键横向位置 `0→-233px`。诗笺小/中/大宽 `392/456/520px`，字号在设置页独立切换并保存，同资料重启仍保留作品、竖排、大字号与大窗。已检查[竖排诗笺](./evidence/T06_NATIVE_CONTENT101_LONG_POEM_MATRIX_20261020_glance.png)和[竖排全文](./evidence/T06_NATIVE_CONTENT101_LONG_POEM_MATRIX_20261020_reading_vertical.png)：诗文、返回及底部操作可见，没有明显裁切。该报告只覆盖本机 96 DPI 的一首长词和 CDP 合成按键；前一哈希的其他体裁/深色键盘矩阵不能转签，实体键盘、读屏、真实缩放及真人阅读判断仍缺，A6 保持**部分通过**。

2026-10-19 规则 `1.2.5` 当前内部 EXE `5CC65F7EC0CC20E44863C5581150BD4DF0DB49056E39E6D59C9081897C9579D0` 的[浅色长词全路径](./evidence/T06_NATIVE_RULE125_LONG_POEM_FULL_MATRIX_20261019.json)与[深色键盘路径](./evidence/T06_NATIVE_RULE125_LONG_POEM_DARK_KEYBOARD_20261019.json)均在独立临时 SQLite/WebView2 资料中通过。正式目录苏轼《水调歌头·明月几时有》竖排全文可见宽/内容宽 `483/716px`，合成方向键使横向位置 `0→-233px`；切换横排保留全文。诗笺宽度 `392/456/520px` 与字号独立，设置页小/中/大实际诗句字号 `19.8/22/25.52px`，同资料重启仍为同一首、竖排、大字号、`520px`。深色阅读页六站 Tab 均有明确 `2px solid` 焦点框，两项折叠说明可用空格展开。已查看本轮全部浅色诗笺/阅读/尺寸/字号/重启截图及深色诗笺/阅读/焦点截图，未见主操作或诗文被裁切。此前规则 `1.2.4` 的一次 `520px` 等待超时未在本轮重现，但一次成功不证明时序问题彻底消失；其余三体裁的旧哈希矩阵也不能自动转给新 EXE。CDP 合成键盘、单机 96 DPI 页面截图不替代实体键盘、读屏、真实 Windows 缩放/多屏或真人排版判断，A6 仍**部分通过**。

实施：新增 `src/core/poem-layout.ts` 将竖排时的诗句按原有中文标点拆成短列，保留每个字符及原顺序；诗笺仅诗文竖排，日期、理由、按钮保持横排。全文页可独立滚动竖排诗文，注释、背景、来源仍横排。诗笺/全文提供即时排版切换，设置中可选横排/传统竖排及小/中/大字号；偏好存在原本地设置记录中。跟随系统主题会响应系统变更。

自动证据：

- 单元测试检查含五言/七言标点、书名号和数字的内容在两种排版下拼接后逐字一致；组件测试检查诗笺和全文的语义顺序、切换事件、滚动区域与字号档位。旧设置自动补默认值，非法值回退安全默认。
- 原生窗口模拟测试证明竖排增高后切回横排会缩回内容高度；`npm.cmd run lint`、`npm.cmd run typecheck`、完整测试（23 文件、125 项）和前端构建通过。
- 浏览器视觉核对：392 逻辑像素宽，《黄鹤楼》两行节选分为四列，竖排居中；中字号完整卡片约需 498 逻辑像素高，大字号约需 536。按此高度预览时按钮可见、没有横向溢出。280×400 的浏览器窄视口下主操作在滚动后可达；点击切换并重新加载后竖排偏好保留。
- 560×720 逻辑像素阅读视口内，全文从右向左成列，页面可向下滚动至解读。阅读内容分列而不删减原文。
- 2026-10-13 对当前 120 首发布节选逐首统计：竖排最多 6 列、最长单列 8 字。独立 Vite 只读统计首次遇模块加载超时，随后用 Vitest 导入同一发布目录完成统计并形成持续回归。小诗笺据此增加超界兜底：未来节选超过任一边界时暂以可换行横排完整显示，并说明“节选较长，暂用横排”；保存的竖排偏好不变，展开全文仍可竖排滚动。长无标点句和七列合成反例、诗笺实际文本、全文页保留竖排及排版切换后重报高度都有自动测试。这是基于现有内容分布的保护界限，不是任意字体、DPI、工作区高度下的视觉通过证明。

未通过/待验：

- 原生 Windows 11、100% 缩放、隔离 profile 已实看《黄鹤楼》四列竖排节选与横排切换，窗口由约 404×513 缩至约 404×407；阅读窗的八句全文在可访问树中保持原顺序。词、长诗、超长无标点句、引号及数字在**实际 WebView2** 的竖排渲染与横向滚动尚无完整样本矩阵；未完成真实读屏测试。
- 125/150/200% Windows 缩放、多屏混合 DPI、低高度显示器与重启后的真实 SQLite 偏好尚未实测。浏览器窄视口不是这些条件的替代证明。
- 上述新增横排兜底仍须在新原生候选中用超长无标点句和最多列节选确认文本没有被卡片裁切，且提示不挤占主要操作；自动测试只证明文字与状态路径。
- 调试链接已通过仅编译桌面需要的 Rust `rlib` 解决；旧发布 EXE 不承载本次源码，不得借其报告证明 A6。

因此 A6 保持**部分通过**，进入 T07 前可使用源码继续开发，但发布门禁不得把 A6 标为完整通过。

2026-10-14 补充同一长题名的浏览器竖排对照：切换并保存大字号竖排后，以受控本地日期和隔离资料重新载入《四时田园杂兴·梅子金黄杏子肥》。392px 宽下完整诗句、理由与操作需约 571px 高；在 392×580 逻辑视口中均可见且无横向溢出，320×260 时可滚动找到操作。静态帧为 `evidence/T06_BROWSER_LONG_TITLE_VERTICAL_LARGE_20261014.png`。本样本的竖排比中字号横排更高，进一步说明竖排是阅读偏好而非保证省空间；真实 WebView2、读屏、实际 Windows 缩放及其他体裁仍待验，A6 继续为**部分通过**。

同日补充展开阅读的真实体裁边界：当前 120 首发布原文中最长全文为苏轼《水调歌头·明月几时有》，8 行 114 字；另选 48 字节选词《浣溪沙·游蕲水清泉寺》、杜甫七言律诗《闻官军收河南河北》及五言律诗《月夜忆舍弟》。`scripts/test-redesign-browser-storage.mjs --reading-audit` 对每首分别检查浅/深色 × 横/竖排 × 小/中/大字号，合计 **48 组真实作品组合**。每组在 560×720 阅读窗及 320×260 低视口确认全文逐字与发布目录一致、阅读窗本身无横向溢出、固定返回按钮可见、滚到底可到来源说明；竖排内容超出横向框时能从右侧滚至左侧。四份 [长词报告](./evidence/T06_BROWSER_READING_LONG_CI_20261014.json)、[长节选词报告](./evidence/T06_BROWSER_READING_LONG_EXCERPT_CI_20261014.json)、[七言报告](./evidence/T06_BROWSER_READING_SEVEN_CHAR_20261014.json)、[五言报告](./evidence/T06_BROWSER_READING_FIVE_CHAR_20261014.json)各有 12 组通过，均标明隔离 Chrome 155 而非原生 WebView2。

逐张观察 [长词浅色横排](./evidence/T06_BROWSER_LONG_CI_LIGHT_HORIZONTAL_20261014.png)、[长词深色竖排](./evidence/T06_BROWSER_LONG_CI_DARK_VERTICAL_20261014.png)、[长节选词浅色竖排](./evidence/T06_BROWSER_LONG_EXCERPT_CI_LIGHT_VERTICAL_20261014.png)、[七言深色竖排](./evidence/T06_BROWSER_SEVEN_CHAR_DARK_VERTICAL_20261014.png)、[五言浅色横排](./evidence/T06_BROWSER_FIVE_CHAR_LIGHT_HORIZONTAL_20261014.png)与[五言深色竖排](./evidence/T06_BROWSER_FIVE_CHAR_DARK_VERTICAL_20261014.png)，诗文与返回/展开入口没有重叠或裁切；其余代表帧同目录保留。长词大字号竖排确需横向滚动，报告中 483px 可见宽对应 716px 内容宽，向左滚动实际发生，不能把首帧误说成全诗同时可见。

发布目录的 120 首**原文**没有书名号、中文引号或阿拉伯数字样本；因此只用不进入作品库的 `《九月九日》：“2026年，登高？”` 等**隔离排版文本**核验 DOM 字符顺序和 CSS 横/竖排。该探针在画面中有“非作品原文”标记，见[横排帧](./evidence/T06_BROWSER_SYNTHETIC_PUNCTUATION_HORIZONTAL_20261014.png)与[竖排帧](./evidence/T06_BROWSER_SYNTHETIC_PUNCTUATION_VERTICAL_20261014.png)。浏览器竖帧中四位数字与部分引号采用浏览器默认混排方向，能读但是否符合最终传统竖排审美仍需项目方和原生 WebView2 看实际样本决定；DOM-only 探针不能证明未来真实作品进入 App 后的完整状态链路，更不是文化内容点校。A6 仍为**部分通过**：实际 125/150/200% Windows 缩放、原生键盘水平滚动/读屏、重启后的 SQLite 偏好和真人排版判断仍未完成。

2026-10-17 在当前未签名、未安装的隔离内部 EXE `0921010061A8D66C551DEAC609B74063433C88B07D836B321F4EAECAF401D4AD` 上，新增 `scripts/test-redesign-native-poem-layout.mjs`，用独立临时 SQLite 只预选**正式目录中的作品**，不改变实际推荐规则。四首代表作品——《水调歌头·明月几时有》《浣溪沙·游蕲水清泉寺》《闻官军收河南河北》《月夜忆舍弟》——分别以小／中／大字号启动原生 WebView2，均由竖排诗笺进入竖排全文，再切为横排并返回同一首。**12/12 组**原始报告均通过：节选和全文逐字与目录一致，阅读面板无横向溢出，返回与来源入口存在，切换后全文不丢字，隔离 SQLite 记录横排偏好。四首大字号报告为[长词](./evidence/T06_NATIVE_LONG_CI_VERTICAL_RECHECK_20261017.json)、[长节选词](./evidence/T06_NATIVE_LONG_EXCERPT_CI_20261017.json)、[七言](./evidence/T06_NATIVE_SEVEN_CHAR_20261017.json)、[五言](./evidence/T06_NATIVE_FIVE_CHAR_20261017.json)；小／中字号报告同目录使用对应 `T06_NATIVE_*_SMALL/MEDIUM_20261017.json` 文件名。逐张检查大字号的四组诗笺／阅读画面及小中字号代表帧，未见诗文与主操作明显重叠；这是本机画面观察，不等于真人长期阅读舒适度。

最长词大字号竖排在原生 WebView2 中的诗文框可见宽 `483px`、内容宽 `716px`；让该框取得焦点后发送方向键，横向滚动位置从 `0` 到 `-233px`，证实隐藏在左侧的列可由键盘到达。其[同资料退出／重启报告](./evidence/T06_NATIVE_LONG_CI_RESTART_20261017.json)记录两个不同进程，重开后仍是同一首、横排与大字号保持，且[重启诗笺画面](./evidence/T06_NATIVE_LONG_CI_RESTART_20261017_restart_horizontal.png)已查看。第一次试跑的[失败报告](./evidence/T06_NATIVE_LONG_CI_VERTICAL_20261017.json)因测试脚本把已由信号退出的进程误判为存活，留下两张不计作签收的画面与一个约 9.8 MB 的临时隔离资料；程序检查本身未报失败。脚本修正退出判定与等待阅读窗稳定后才复测，失败原件未覆盖；该临时目录未触及真实用户资料，尚未删除。

上述 12 组批次只覆盖当前单机原生 WebView2、浅色主题与预设的三档字号；当时字号**没有**通过设置页逐档保存，只有横竖排按钮及其 SQLite 保存／一次重启得到验证。真实读屏、125/150/200% Windows 缩放、多屏混合 DPI、低工作区、正式目录没有的引号／数字混排及具名审美判断依然未测。A6 保持**部分通过**，不得把 12 组同机样本称为所有窗口尺寸或人体验收。

2026-10-17 追加设置页真实操作路径：仍使用同一内部 EXE 哈希、独立临时 SQLite 资料及正式目录的苏轼《水调歌头·明月几时有》，不动真实资料、系统时钟、显示设置或启动项。测试从诗笺进入阅读、切换排版、返回，再在**原生 WebView2 设置页**按“小→中→大”逐档选字号并提交表单；每次检查 SQLite 保存值、回到同一首诗的诗笺、实际计算字号、全文阅读，以及同资料退出／重启。为保留可重演的完整证据，横排与竖排分别复核，见[横排设置路径](./evidence/T06_NATIVE_HORIZONTAL_FONT_UI_RECHECK_20261017.json)和[竖排设置路径](./evidence/T06_NATIVE_VERTICAL_FONT_UI_RECHECK_20261017.json)，两条均通过。此前两份首轮通过报告也原样留存，复核报告才对应脚本的最终参数与无提示遮挡的画面。

竖排诗笺实际字号依次为 `19.8px / 22px / 25.52px`，全文大字号保持 `vertical-rl`，长词诗文框宽 `315px`、内容宽 `716px`，正文可横向滚动而面板本身不横向溢出；重启仍是同一首、竖排、大字号。横排同样完成三档保存与重启。已逐张查看[竖排小字号](./evidence/T06_NATIVE_VERTICAL_FONT_UI_RECHECK_20261017_settings_font_small.png)、[竖排大字号](./evidence/T06_NATIVE_VERTICAL_FONT_UI_RECHECK_20261017_settings_font_large.png)和[大字号全文](./evidence/T06_NATIVE_VERTICAL_FONT_UI_RECHECK_20261017_reading_after_font_save.png)，诗文、来源和主操作未见明显互压。隔离资料下系统开机启动不会被修改，因此保存后会出现保护性提示并暂留设置页；测试点击返回后验证新字号已生效。这是 CDP 驱动的原生 WebView2 页面操作，不是人工鼠标/读屏使用测试。

此次只关闭“设置页逐档保存并重启保留”的原生子项。屏幕阅读器的实际朗读与焦点、真实 125/150/200% 系统缩放、多屏混合 DPI、真实低工作区、特殊引号／数字竖排审美和目标用户长期阅读判断仍未通过；A6 继续**部分通过**。

演练预警文案修正后的新内部候选哈希 `4507FF5002D3C4E749C6F411D371D3331C30E0AC5F438353634D19FD371BC029` 又抽查[竖排设置页小／中／大字号保存、全文及同资料重启](./evidence/T06_WARNING_COPY_CANDIDATE_FONT_SPOT_20261017.json)并通过；原先四体裁 12 组矩阵及横排设置页画面仍绑定旧哈希，不能自动转记为新候选完整矩阵。A6 继续**部分通过**。

同日托盘安全复查修正后的内部候选哈希 `3CD3094FDF09CCD36E0EA67E0C59CD5E3DF3609BAFCA0363FE62BC7F1BE0C6F0` 又抽查[竖排设置页小／中／大字号、全文与同资料重启](./evidence/T06_HIDDEN_WARNING_CANDIDATE_FONT_SPOT_20261017.json)并通过；旧候选的 12 组作品矩阵及横排设置页画面仍不自动转移。读屏、真实缩放和真人审美未补齐，A6 保持**部分通过**。

2026-10-19 新诗笺窗口大小控制独立于原有小／中／大字号。在未安装内部候选 `3D3856613786D6961B6BE7ECF5274F8E017DE79E1AB8CAA541F8B498A4B0ED10` 上，用正式目录《黄鹤楼》的大字号在[原生设置页三档与重启报告](./evidence/T04_NATIVE_GLANCE_SIZES_STARTUP_FIX_20261019.json)中逐档切换窗口宽度 `392/456/520`；每档 `poemFontSize` 保持 `large`、诗笺无横向溢出、操作区可达。小档、宽档与同资料重启截图见 T04，逐张检查未见明显裁切。此报告只检验一首作品的窗口大小与字号独立性，不替代旧候选四体裁 12 组排版矩阵、特殊标点、真实缩放、读屏或真人阅读判断；A6 仍**部分通过**。

2026-10-19 在同一未安装候选 `3D3856613786D6961B6BE7ECF5274F8E017DE79E1AB8CAA541F8B498A4B0ED10` 上追加当前哈希原生长词样本，命令为 `node scripts/test-redesign-native-poem-layout.mjs .work/redesign-glance-startup-fix-20261019/release/weatherpoem.exe review/redesign/evidence/T06_NATIVE_GLANCE_CANDIDATE_LONG_POEM_FULL_MATRIX_20261019.json su-shi-shui-diao-ge-tou --require-overflow --verify-restart --exercise-font-setting --exercise-glance-size --font-size=large --font-setting-layout=vertical`。报告结果 `native-glance-size-setting-and-restart-passed`，正式目录《水调歌头·明月几时有》绑定当前 EXE 哈希；隔离临时 SQLite、离线规则天气，不触及真实资料、系统时钟、显示设置、启动项或安装状态。竖排全文可见框宽 `483px`、内容宽 `716px`，方向键将横向位置从 `0` 移至 `-233px`；切换横排后仍保留同一全文。诗笺小／中／大尺寸为 `392/456/520px`，字号保持大档；设置页小／中／大字号实际为 `19.8/22/25.52px`，每档提交后回到同一诗笺且无文档横向溢出。同资料重启后仍保持大档 `520px`、竖排与同一作品。结构化原始报告及 10 张 CDP 页面截图见[原生长词全路径报告](./evidence/T06_NATIVE_GLANCE_CANDIDATE_LONG_POEM_FULL_MATRIX_20261019.json)及同名前缀 PNG；已查看诗笺、竖排全文、尺寸极值、设置保存后诗笺与重启画面，未见明显裁切或操作遮挡。截图属于页面捕获而非桌面全屏。该样本只在 Windows 11 单屏 1920×1080、96 DPI 的本机原生 WebView2 下验证一首长词；不代替真实屏幕阅读器、125/150/200% 缩放、多屏混合 DPI、低工作区、特殊标点真人排版判断或目标用户舒适度测试。A6 继续**部分通过**。

2026-10-19 补验原生键盘阅读路径。旧候选的[初查报告](./evidence/T06_NATIVE_GLANCE_CANDIDATE_KEYBOARD_NAVIGATION_20261019.json)先证明六站 Tab 次序、空格折叠和长词滚动可操作，但当时只要求焦点环非空。更严格的[红测报告](./evidence/T06_NATIVE_GLANCE_CANDIDATE_KEYBOARD_FOCUS_RED_20261019.json)发现返回、收藏、排版和竖排滚动区有主题色 `2px solid` 焦点框，而“放回它的时代”仅落到 Chromium 默认 `outline:auto 1px`（黑色），样式不统一且深色下可见性风险更高。将 `summary:focus-visible` 加入普通与 `forced-colors` 焦点规则，并把门禁扩展为检查 `Tab` 顺序、明确焦点样式和空格折叠；独立新候选 `.work/redesign-accessibility-focus-ring-20261019/release/weatherpoem.exe` SHA-256 `7BFC5F340E992D15D95BE56DAF0C356A7BA261C0B9A8B3BF795B59E5310FF627` 的[浅色原生复测](./evidence/T06_NATIVE_GLANCE_CANDIDATE_KEYBOARD_FOCUS_RING_20261019.json)通过：六个停靠点都为主题色 `2px solid`，两项说明均可用空格展开，长词仍能方向键横向滚动至 `-233px`，同资料重启返回同一作品；同哈希[深色路径报告](./evidence/T06_NATIVE_GLANCE_CANDIDATE_KEYBOARD_FOCUS_DARK_20261019.json)亦为六站 `2px solid`，焦点色为 `rgb(211, 145, 124)`。测试使用临时 SQLite、离线天气和 CDP 合成按键；[浅色](./evidence/T06_NATIVE_GLANCE_CANDIDATE_KEYBOARD_FOCUS_RING_20261019_keyboard_focus_summary.png)与[深色折叠项焦点画面](./evidence/T06_NATIVE_GLANCE_CANDIDATE_KEYBOARD_FOCUS_DARK_20261019_keyboard_focus_summary.png)已查看。此结果只证明该候选、本机单屏 96 DPI 的 WebView2 自动键盘路径；不替代实体键盘、屏幕阅读器或实际 Windows 强制颜色/缩放验收，`RQT-14` 和 A6 仍**部分通过**。

2026-10-19 在当前规则 `1.2.4` 内部候选 `.work/redesign-recommendation-124-20261019/release/weatherpoem.exe`（SHA-256 `3759CE59650FDB6681FA55BAD25542F3DA501D22B4832A40ECE3F4ED931712A4`）重跑苏轼《水调歌头·明月几时有》的原生长词矩阵。首次[报告](./evidence/T06_NATIVE_GLANCE_RULE124_LONG_POEM_20261019.json)通过，但截图名固定为 `restart_horizontal`，而结构化 `restartGlance.vertical=true`、画面实际为竖排。随后脚本按实际方向命名截图，并在[一轮复跑](./evidence/T06_NATIVE_GLANCE_RULE124_LONG_POEM_RECHECK_20261019.json)中于第三档等待 `520px` 稳定时超时；该轮已保存的小/中档与全文截图、失败报告均保留。超时报告没有记录最后视口状态，不能判定为产品缺陷或单纯测试时序问题。

测试器因此补上真实布局方向截图名、测试器自身 SHA-256 和视口等待失败诊断；以最终脚本哈希 `70980A4B0AEDC9BE46C8C4D463F59F2C4ED6454BC5522F8524E7D30C232F0E5A` 完成的[诊断复跑](./evidence/T06_NATIVE_GLANCE_RULE124_LONG_POEM_DIAGNOSTIC_20261019.json)通过，EXE SHA-256 仍与前述候选一致。报告测得竖排全文框宽 `483px`、内容宽 `716px`，CDP 方向键让横向位置 `0→-233px`；切换横排后全文一致且面板 `551/551px` 无溢出。窗口尺寸 `392/456/520px` 与字号偏好互不覆盖，设置页实际字号为 `19.8/22/25.52px`；操作可达、无文档横向溢出，同资料重启仍回到竖排、大字号、`520px`。已查看最终[竖排长词](./evidence/T06_NATIVE_GLANCE_RULE124_LONG_POEM_DIAGNOSTIC_20261019_reading_vertical.png)、[小诗笺](./evidence/T06_NATIVE_GLANCE_RULE124_LONG_POEM_DIAGNOSTIC_20261019_glance_small.png)、[大诗笺](./evidence/T06_NATIVE_GLANCE_RULE124_LONG_POEM_DIAGNOSTIC_20261019_glance_large.png)及正确命名的[重启画面](./evidence/T06_NATIVE_GLANCE_RULE124_LONG_POEM_DIAGNOSTIC_20261019_restart_vertical.png)，未见明显裁切或操作遮挡。尺寸反复切换出现一次超时、一次通过，故这条时序差异仍需复现；不据单次成功提升 A6。资料及系统时钟/显示设置均未触碰，CDP 合成键盘不替代实体键盘；真实读屏、系统缩放、多屏混合 DPI、特殊标点与真人阅读仍未完成，A6 继续**部分通过**。
