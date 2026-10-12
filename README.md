# WeatherPoem · 今日诗笺

WeatherPoem 是一个面向大学生的低打扰桌面应用：每天第一次打开电脑时，
根据当地的传统节日、天气和节气，推荐一首可追溯的中国古典诗词。

推荐优先级固定为：

1. 传统节日
2. 当地天气
3. 当日节气
4. 季节、时段和内容质量

默认界面只保留诗题、作者、两句正文和一句推荐理由。需要时可以进入延伸阅读，
查看全文、时代背景、当代生活连接、词句小注和文本来源。

## 已实现

- Vue 3 + TypeScript 的桌面界面
- Tauri 2 的 Windows 桌面壳、系统托盘、单实例与开机启动
- 区分手动启动和开机自启动，同一自然日不重复自动弹出
- 首次城市设置、主题和减少动态效果
- 基于节日、天气、节气、季节、时段的可解释规则推荐
- 可选的受控 AI 理由服务，严格校验作品标识、长度和输出格式，失败立即降级
- 可独立部署的 AI 理由网关：服务端目录复核、严格结构化输出、限流、缓存和密钥隔离
- 47 场景的 AI 理由发布评测集：自动契约/时延指标、三轮无缓存运行与具名人工评分
- 同日保留同一首、七日内避免重复、作者多样性和不喜欢反馈
- 每天一次“换一首”
- 全文阅读、收藏列表和本地反馈
- 键盘页面焦点、读屏语义、关键文字 4.5:1 对比度、高对比主题、
  200% 等效窄视口回流与减少动态的无障碍自动基线
- 隔离性能基线：10 次干净启动、10 次已配置诗笺首帧、60 秒托盘资源采样、
  三类受控故障矩阵与两分钟长稳采样器演练
- SQLite 本地持久化，仅开放加载、查询、关闭与参数化写入；浏览器调试时自动降级为 localStorage
- Open-Meteo 基础天气、六小时缓存和离线规则降级
- 雷暴、强风、强降水的基础安全代理：出现风险时暂停诗笺
- 可配置的授权预警网关适配层：校验地区、发布机构、发布时间和有效期，失败安全降级
- 120 首公版古典诗词的结构化内容，覆盖八个传统节日、二十四节气、四季、四时段和主要天气

## 本地运行

环境要求：

- Node.js 22 或更高版本（项目使用 Node.js 24 验证）
- Rust stable
- Windows 上构建安装包时需要 WebView2 与 Visual Studio C++ 构建工具

安装与网页调试：

```powershell
cd E:\weatherpoem
npm install
npm run dev
```

运行桌面开发版：

```powershell
npm run tauri:dev
```

质量检查与构建：

```powershell
npm run check
npm run content:check
npm run content:review:check
npm run content:withdrawal:check
npm run device:matrix:check
npm run desktop:capability:check
npm run performance:smoke
npm run performance:fault-matrix
npm run performance:long-run:rehearsal
npm run performance:check
npm run accessibility:check
npm run security:audit:check
npm run security:cargo-audit:check
npm run security:dependency-review:check
npm run requirements:check
npm run reason:check
npm run reason:eval:check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build
npm run release:checksums
npm run release:manifest
npm run release:test:nsis
npm run release:test:msi-image
npm run release:test:single-instance
npm run release:test:window-position
npm run release:verify
```

`performance:fault-matrix` 使用隔离账户注入立即离线、天气超时和模拟官方预警，
只证明降级状态与时间阈值，不代表真实在线服务或真实预警源。正式八小时托盘采样
可前台使用 `npm run performance:long-run`，或用
`npm run performance:eight-hour:start` 在隐藏进程中启动；它会持续写检查点，
完成后由 `npm run performance:eight-hour:check` 复算，但仍需要具名质量负责人
签署。

项目就绪分为内部试用、校园试点和公开发布三级。查看或强制检查对应门禁：

```powershell
npm run requirements:generate
npm run requirements:pilot
npm run requirements:public
```

当前只有内部试用为 `ready`；后两个命令会按预期失败并列出未完成证据。

联网刷新 npm 与 Windows 目标 Rust 依赖审计：

```powershell
npm run security:audit
$env:CARGO_AUDIT_BIN = 'D:\纯净工作台\.workbench\tools\cargo-audit\bin\cargo-audit.exe'
npm run security:cargo-audit
Remove-Item Env:\CARGO_AUDIT_BIN
```

如果 `cargo-audit` 已在 `PATH` 中，无需设置 `CARGO_AUDIT_BIN`。扫描报告与目标
过滤边界见 `docs/SECURITY_PRIVACY.md`。普通 `npm run check` 只离线复核两份报告
及依赖风险处置草案仍绑定当前锁文件、Windows 实际依赖树且未过期，不会在每次
构建时隐式联网。联网刷新上游处置状态使用：

```powershell
npm run security:dependency-review
```

需要管理员权限、两次真实 Windows 重启和干净专用账号的发布证据不属于上述
普通构建流程。获批后按 `docs/WINDOWS_MANUAL_EVIDENCE.md` 执行，并分别用
`npm run release:verify:manual-windows` 与 `npm run release:verify:upgrade`
校验。脚本不会自动重启系统、替用户修改开机启动设置，也不会在检测到既有应用
数据时强行执行升级/回滚生命周期。

仓库包含项目级 `.cargo/config.toml`，用于避免开发机全局代理污染构建，并通过
rsproxy 镜像获取由 `Cargo.lock` 固定的 crates.io 依赖。完全离线且缓存齐全时可执行：

```powershell
cargo check --manifest-path src-tauri/Cargo.toml --offline
```

如团队要求只使用官方 crates.io，可删除项目级源替换并在网络可达环境中重新验证锁文件。

网页调试可以使用以下场景参数：

- `http://127.0.0.1:1420/?scenario=onboarding`
- `http://127.0.0.1:1420/?scenario=reading`
- `http://127.0.0.1:1420/?scenario=warning`
- `http://127.0.0.1:1420/?scenario=official-warning`
- `http://127.0.0.1:1420/?scenario=content-correction`
- `http://127.0.0.1:1420/?scenario=content-suspended`

这些参数只在开发模式生效。

## 目录关系

实际项目和纯净工作台保持隔离：

- `E:\weatherpoem`：源代码、测试、构建结果与项目文档
- `D:\纯净工作台`：任务编排、项目扫描、审计、验证与记忆

从纯净工作台检查外部项目：

```powershell
cd D:\纯净工作台
.\cw.ps1 project roots list
.\cw.ps1 project scan
.\cw.ps1 project audit -Project E:\weatherpoem
.\cw.ps1 workflow recommend -Project E:\weatherpoem
.\cw.ps1 run weatherpoem-verify
.\wb.ps1 refresh
```

纯净工作台不存放 WeatherPoem 的源码，也不替代实际开发目录。

## 数据与隐私

- 城市设置、每日状态、收藏、阅读历史和反馈仅保存在本机。
- 当前版本不读取精确定位，只使用用户主动选择的城市中心坐标。
- 当前版本没有统计端点。自愿校园试点只在本机按自然日聚合，参与者主动复制摘要；
  退出立即删除，不记录账号、城市、作品或原始事件。
- 设置页可清除设置、每日状态、收藏、阅读历史、反馈、试点记录和天气缓存；清除后同时关闭
  开机启动并回到首次设置，不会删除同一 WebView 存储中的无关键。
- 基础天气由 [Open-Meteo](https://open-meteo.com/) 提供，请求只包含城市经纬度。
- 诗词内容随安装包提供，离线时仍可依据节日、节气和季节推荐。

## 安全边界

当前天气风险提示是基于 Open-Meteo 即时天气代码、风速和小时降水量生成的
基础代理，不是中国气象部门的正式预警。客户端已支持通过
`VITE_WARNING_API_URL` 接入授权 HTTPS 网关，并校验来源、发布时间、地区、等级和
失效时间；没有配置正式端点时继续使用基础代理。

任何有效官方预警，或基础代理判断为较高风险时，应用优先展示安全信息并暂停诗词推荐；
用户仍应以当地气象部门和应急部门发布的信息为准。服务契约与部署责任见
`docs/WARNING_GATEWAY.md`。

桌面 capability 只开放当前使用的基础窗口、托盘、自启动、单实例、SQL 加载/查询/
关闭和参数化写入能力，不开放 Shell、任意文件系统、进程、全局快捷键或通用 HTTP
权限。性能测量只允许把数据库和 WebView 数据写入系统临时目录中的固定前缀隔离账户。

## 推荐可解释性

规则实现在 `src/core/recommendation.ts`。每次推荐会保存内容版本、规则版本、
主情境和作品标识，但不会保存精确位置。推荐理由限制在 40 个汉字以内。

本地规则先确定唯一作品和安全的预设理由。若配置 `VITE_REASON_API_URL`，
应用只向该服务发送已选作品、标准化日期/节日/节气/天气和 40 字约束，不发送
经纬度、收藏或阅读历史。服务必须返回：

```json
{
  "workId": "zhao-shi-xiu-yue-ke",
  "reason": "阴云与夏雨相接，让等待也有了清晰的声音。"
}
```

作品标识不一致、理由少于 6 字或超过 40 字、包含换行/链接/模型自我声明、
请求失败或超过 2.5 秒，都会无条件保留规则理由。未配置端点时完全离线运行。
桌面 CSP 默认只允许本机理由服务；接入正式 HTTPS 服务时需同步收窄并更新 CSP。

当前权重：

| 因素 | 分值 |
| --- | ---: |
| 节日匹配 | +50 |
| 节日不匹配 | -24 |
| 天气匹配 | +20 |
| 节气匹配 | +10 |
| 季节匹配 | +10 |
| 时段匹配 | +5 |
| 内容质量 | 最高 +10 |
| 七日内重复 | -120 |
| 近期同作者 | -8 |
| 不喜欢的相近标签 | -30 |

## 关键目录

```text
src/
  components/       界面组件
  core/             日期语境与推荐规则
  data/             城市和诗词内容
  services/         天气、持久化与桌面桥接
src-tauri/           Tauri 桌面壳与权限
docs/                产品设计工作稿
output/              正式需求说明文档
review/              与当前内容版本绑定的专家审核事实快照
outputs/             专家审核工作簿等人工协作交付物
prototype/           早期静态交互原型
```

产品需求和验收基线见：

- `output/WeatherPoem_项目需求与落地实施方案_v3.0.docx`
- `docs/WeatherPoem_产品设计工作稿.md`
- `docs/CONTENT_WORKFLOW.md`
- `outputs/content-review-2026.07.1/WeatherPoem_内容专家审核工作簿_2026.07.1.xlsx`
- `docs/WARNING_GATEWAY.md`
- `docs/CONTENT_CONTROL.md`
- `docs/INCIDENT_RUNBOOK.md`
- `docs/AI_REASON_SERVICE.md`
- `docs/WINDOWS_RELEASE_TRUST.md`
- `docs/WINDOWS_MANUAL_EVIDENCE.md`
- `docs/SECURITY_PRIVACY.md`
- `docs/PILOT_PLAN.md`
- `docs/ACCESSIBILITY.md`
- `docs/PERFORMANCE_VERIFICATION.md`
- `docs/PROJECT_READINESS.md`
- `docs/DEVICE_MATRIX.md`
- `docs/MVP_VERIFICATION.md`

## 当前发布范围

首个工程版本以 Windows 10/11 为目标。macOS 适配、官方气象预警源、内容后台、
跨设备同步和个性化模型不在本次 MVP 范围内。

当前 `0.2.0` 是明确标识的未签名 M1 内部试用版。正式公开发行必须通过
Authenticode 签名、可信时间戳、允许的证书指纹、HTTPS 地址和发布清单门禁；
具体操作与自动更新边界见 `docs/WINDOWS_RELEASE_TRUST.md`。
