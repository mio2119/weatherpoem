# WeatherPoem 安全、隐私与数据清除

更新时间：2026-07-24

## 1. 当前边界

WeatherPoem 0.2.0 是未签名内部试用版。当前客户端：

- 不读取精确定位，只使用用户主动选择的城市中心坐标；
- 不上传收藏、阅读历史、反馈或试点聚合统计；
- 不把 OpenAI 或其他服务密钥放入客户端；
- 仅按 Tauri capability 和 CSP 中显式声明的范围访问桌面能力与网络；
- AI 理由未配置时完全使用本地规则，天气和预警失败时安全降级。

这些工程事实不替代正式安全评审、隐私文本、第三方授权和组织签署。

### 1.1 桌面权限与性能隔离

主窗口 capability 只包含当前功能所需的核心窗口/事件、自启动、安全外链和 SQL
能力。SQL 使用 `sql:default` 完成加载、查询和关闭，并单独增加
`sql:allow-execute` 以允许参数化写入设置、每日状态、历史、收藏和反馈。未开放
Shell、任意文件系统、进程、通用 HTTP、全局快捷键或全局窗口权限。

`npm run desktop:capability:check` 会拒绝缺失 SQL 写入权限以及新增上述高风险权限。
这条检查也确保性能专用数据库只在同时提供合法运行标识和探针时启用，路径必须位于
系统临时目录下以 `WeatherPoem.Performance.` 开头的隔离账户中。性能模式同时隔离
SQLite 数据库与 WebView 用户数据，不能借性能脚本读取真实用户账户。

## 2. 本地数据清单

| 数据 | 用途 | 位置 | 当前保留 |
| --- | --- | --- | --- |
| 城市、主题、减少动态、自启偏好 | 个性化与启动行为 | SQLite；浏览器调试降级为 localStorage | 用户清除前 |
| 每日推荐状态 | 同一自然日不重复弹出 | 同上 | 当前实现只读取最近状态 |
| 阅读历史 | 七日去重与作者多样性 | 同上 | 最多 60 条 |
| 收藏 | 用户主动保存 | 同上 | 用户清除前 |
| 不喜欢/换一首反馈 | 本地推荐降权 | 同上 | 最多 100 条 |
| 自愿试点按日聚合与无时间戳会话计数 | 观察送达、深入阅读、不贴合和异常中断 | 独立 SQLite KV；浏览器调试降级为独立 localStorage 键 | 28 天记录；第 35 天起下次启动清除；退出即删 |
| 天气响应缓存 | 六小时离线降级 | localStorage | 最长六小时 |
| 内容撤回安全缓存 | 断网时继续阻止错误内容传播 | localStorage | 当前内容版本有效期间 |

当前没有服务端用户账号、跨设备同步、统计端点或遥测事件库。试点聚合不含账号、
IP、设备信息、城市、作品 ID、操作时刻、会话时间点、崩溃堆栈或原始事件，只能
由参与者主动复制摘要。会话状态只保存已结束数、异常中断数和一个当前打开标记。

## 3. “清除个人数据与设置”的可验证语义

设置页操作会：

1. 删除 SQLite 或浏览器降级存储中的设置、每日状态、阅读历史、收藏、反馈、
   试点同意状态和聚合记录；
2. 删除 `weatherpoem.weather-cache.v1` 天气缓存；
3. 关闭已注册的开机启动；
4. 将运行中界面恢复到首次设置和系统主题；
5. 不删除同一 WebView 存储中的无关键。

清除持久层失败时操作会失败，不显示“完整清除”结果。相关实现与测试：

- `src/services/data-reset.ts`
- `src/services/data-reset.test.ts`
- `src/services/persistence.test.ts`
- `src/services/weather.test.ts`

这项操作删除的是应用可访问的用户内容，不删除程序、安装目录或数据库文件本身。
内容撤回安全缓存不属于个人数据并会保留，避免清除数据或断网后让错误内容复活。
卸载是否保留应用数据属于独立的安装器保护边界。

试点记录还可以在“设置 → 校园试点”单独退出并立即删除。应用未运行时不能执行
后台删除，因此“第 35 天清除”的准确语义是第 35 天起下次启动时删除；正式试点
结束流程必须要求参与者主动退出或清除，不能只依赖卸载。

## 4. 依赖审计

生成联网审计：

```powershell
cd E:\weatherpoem
npm run security:audit
$env:CARGO_AUDIT_BIN = 'D:\纯净工作台\.workbench\tools\cargo-audit\bin\cargo-audit.exe'
npm run security:cargo-audit
Remove-Item Env:\CARGO_AUDIT_BIN
```

离线复核报告是否仍绑定当前锁文件、未超过 30 天且没有安全漏洞：

```powershell
npm run security:audit:check
```

联网刷新停止维护依赖的上游处置草案：

```powershell
npm run security:dependency-review
npm run security:dependency-review:check
```

报告位于：

- `output/WeatherPoem_0.2.0_DEPENDENCY_AUDIT.json`：npm audit 与 OSV；
- `output/WeatherPoem_0.2.0_CARGO_AUDIT.json`：官方 RustSec 数据库与原生
  `cargo-audit 0.22.2`；
- `output/WeatherPoem_0.2.0_DEPENDENCY_RISK_REVIEW.json`：停止维护依赖链、
  上游稳定版、已合并修复和拟议升级期限。

两份扫描报告都绑定 `src-tauri/Cargo.lock` 的 SHA-256；npm/OSV 报告同时绑定
`package-lock.json`。风险处置草案另绑定原生审计报告与 Rust 锁文件。

2026-07-24 当前结果：

- npm：268 个依赖，`info/low/moderate/high/critical` 均为 0；
- Rust Windows 目标：只扫描
  `x86_64-pc-windows-msvc` 的 normal/build 实际依赖树，共 286 个
  crates.io 包；OSV 与原生 RustSec 的目标内安全漏洞均为 0，目标内
  `unsound`/`yanked` 阻断警告为 0；
- Rust 信息性公告：5 项，均为 Tauri 间接依赖链中的 `unic-* 0.9.0`
  停止维护公告，不是当前安全漏洞。

5 项公告已经确认来自同一条链：
`tauri 2.11.5 → tauri-utils 2.9.3 → urlpattern 0.3.0 →
unic-ucd-ident 0.9.0`。`unic-ucd-ident` 再带入另外四个 `unic-*` 包，因此这是
一个上游升级事项，不是五个独立直接依赖。

截至 2026-07-24，crates.io 上 Tauri 最新稳定版仍为 `2.11.5`、
`tauri-utils` 为 `2.9.3`；Tauri
[PR #15660](https://github.com/tauri-apps/tauri/pull/15660) 已在
`dd725f4b13c30a86b398ccc59eb498f151f461c5` 中把 `urlpattern` 升为 `0.6`。
`urlpattern 0.6` 已使用 `icu_properties`，不再依赖 `unic-ucd-ident`，但在
当时尚未进入稳定 Tauri。旧草案的 2026-08-31 复核日已经过去，不能继续当作
当前计划；不为消除信息性公告而把核心框架钉到未发布 Git 提交。

2026-10-15 重新取得官方 RustSec 快照并核验当前锁文件：Windows 目标 285 个
依赖、0 个已知漏洞、5 项 `unic-*` 停止维护公告；另外 2 个非 Windows 目标
原始发现保留在报告中。当前 crates.io 稳定版 `tauri 2.12.4` 的普通依赖为
`tauri-utils ~2.10.2`，`tauri-utils 2.10.2` 的普通依赖为 `urlpattern ^0.6`；
已发布的稳定版因此具备移除旧链的升级路径。项目本身仍锁定
`tauri 2.11.5 → tauri-utils 2.9.3 → urlpattern 0.3.0`，尚未执行升级。
新处置草案提出在下一发行候选前升级已发布稳定版，并在 30 天内复核；这是
机器草案，不是具名安全批准。npm/OSV 组合扫描初次遭遇网络连接重置，重试后
发现旧 npm 锁文件含 5 项漏洞记录（1 中危、4 高危）；在现有版本范围内更新
Vue 与相关间接依赖后重新扫描，当前 npm 268 个依赖与 Windows 目标 Rust 285
个 crates.io 包的已知安全漏洞均为 0。报告已绑定新 `package-lock.json` 和
当前 `Cargo.lock`；既有内部 EXE 仍由旧 npm 锁文件构建，不能把新扫描结果当成
该 EXE 的发行验收。

旧 npm 锁文件 SHA-256 为 `B25F08E34940D57B7A4DCB37CBDE24A0D9EE18DBFB450BDECC88BB5FB1BB7934`，
新锁文件为 `3598C80AA39780AF3027B47AE907201EA4187B9CDA291F4E9E608221EFA96AEC`。
本次在允许的版本范围内将 Vue 从 `3.5.40` 更新至 `3.5.44`，并更新
`brace-expansion`、`postcss-selector-parser`、`source-map-js` 等间接包；
旧锁文件的发现对应
[Vue SSR 属性名公告](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6)、
[brace-expansion 公告](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)、
[PostCSS 选择器公告](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)和
[source-map-js 公告](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。
这些是锁文件扫描发现，不等同于已证明可通过本桌面应用触发；修复后的当前锁文件
由 `security:audit:check` 复算通过。

OSV 批量查询依据官方 `v1/querybatch` 契约。扫描器会拒绝分页截断、目标依赖树
解析失败、锁文件变化、报告过期和任何非信息性 Rust 发现。

原生扫描通过 GitHub API 取得 RustSec `main` 的精确提交 SHA，再从官方 codeload
HTTPS 地址下载该提交归档并记录归档 SHA-256。`cargo-audit` 的原始 Cargo.lock
结果完整保留：当前有 [rsa 0.9.10 / RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071.html)
和 [rkyv 0.7.46 / RUSTSEC-2026-0235](https://rustsec.org/advisories/RUSTSEC-2026-0235.html)
两项不属于 Windows 目标依赖树的漏洞发现；另有非目标的
`proc-macro-error` 停止维护和 `glib` unsound 公告。校验器重新运行
`cargo tree --target x86_64-pc-windows-msvc --edges
normal,build`，只在发现确实属于当前构建树时才计入 Windows 目标结论。非目标发现
只能保留，不能删除或伪装成目标内通过。

## 5. 仍未关闭的风险

- 5 项停止维护的 `unic-*` 已归并为一个 Tauri/urlpattern 上游升级事项，修复已
  在稳定版发布，但项目尚未升级；机器草案提出在下一发行候选前升级，仍需安全
  负责人批准或修改。
- 原生 Cargo.lock 原始报告包含非 Windows 目标发现；自动目标过滤已有依赖树契约，
  但安全负责人仍需复核未启用路径与最终发布目标一致。
- 锁文件扫描只能发现已公开且能映射到版本的漏洞，不能替代源代码、权限、日志、
  供应链、业务滥用和隐私文本评审。
- SQL 参数化写入与最小 capability 已有自动契约，但仍需具名安全负责人复核权限清单、
  SQLite 数据清除语义和性能隔离边界。
- 当前没有具名安全与隐私批准文件，
  `review/evidence/RQT-15-security-privacy-review.json` 仍应保持缺失。
- `review/pilot-plan.json` 与 `docs/PILOT_PLAN.md` 是等待批准的候选方案；没有真实
  负责人、联系方式和隐私/伦理判断前不得开始招募。

## 6. 具名评审最低内容

安全与隐私负责人至少需要确认：

- 当前 capability、CSP、外部 URL 和服务端密钥边界；
- 所有本地数据、保留期、清除操作和卸载保留行为；
- npm、OSV 与原生 cargo-audit 对当前候选锁文件的结果；
- 5 项停止维护依赖的接受或升级决定；
- 日志不包含密钥、精确位置和用户内容；
- 试点 v2 同意、退出、联系方式、按日事件最小集与无时间戳会话计数；
- P0/P1 缺陷为零或有具名、限期的风险接受。

完成后按 `review/evidence/README.md` 生成具名证据摘要，不能把本文件或自动报告
本身当作人的批准。
