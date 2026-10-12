# WeatherPoem 内容、资产与第三方许可清单

更新时间：2026-07-24  
适用版本：WeatherPoem 0.2.0 / 内容 2026.07.1  
当前结论：台账已建立，**公开发布许可尚未完成**。

本文件用于整理事实、待办和签署材料，不构成法律意见。机器可读明细位于
`review/content-asset-license-inventory.json`；运行 `npm run licenses:check`
可确认它仍与当前内容、图标、锁文件和 Windows 目标依赖一致。

## 当前边界

| 类别 | 已确认的工程事实 | 公开发布前还要完成 |
| --- | --- | --- |
| 项目代码与文档 | `package.json` 标记为 private；根目录没有 LICENSE/NOTICE | 确认权利主体和贡献关系，选择发布许可并生成 LICENSE/NOTICE |
| 120 首古典诗词 | 每首有作者、朝代和 `sourceName`；底层古代作品可作为公版候选 | “作品公版”不等于“具体点校/转录版本可直接使用”；逐首绑定权威底本、页码或明确无版权限制的数字源 |
| 现代解释 | 120 条一句导读、120 条文化背景、120 条当代连接及逐词注释已入库 | 确认撰写者、委托关系和权利归属，排除对第三方现代译注的不当改写 |
| 图标与内联图形 | 应用图标源文件及全部生成变体已有哈希；界面图形是仓库内 SVG/CSS | 由设计/项目主体确认原创或许可来源，并保留生成、修改和交付记录 |
| 字体 | 当前只引用系统字体回退，没有打包 `.ttf/.otf/.woff` 等字体文件 | 保持不内嵌；以后若打包字体，先登记版本、许可文本与再分发权限 |
| npm / Rust 依赖 | 当前锁文件中的 268 个 npm 包与 Windows 目标 286 个 Rust 第三方包均有许可元数据；NOTICE 草案已去重收集 300 份可追溯文本。上游可验证文本仍覆盖 259/268 个 npm 包和 284/286 个 Rust 包，9 + 2 个上游发布物缺口如实保留；分发侧用 SPDX v3.28.0 固定提交中的五份规范文本补充 11 个显式例外，因此分发可读许可文本覆盖达到 268/268 与 286/286。来源链包含同版同仓库映射、npm integrity/整包哈希、npm gitHead、Cargo.lock checksum、crate 内 VCS 提交、SPDX 固定提交及逐文件哈希；Tauri 已配置在下一次构建时把草案放入安装包 `licenses` 目录，应用只通过固定原生命令打开该文件 | 复核 11 个规范文本例外、复合许可、兼容性与署名义务；选择项目发布许可；长测结束后重建并验证安装产物确实包含且能打开最终文件 |

自动生成的依赖明细和文本分别位于
`review/third-party-notice-index.json` 与 `docs/THIRD_PARTY_NOTICES.md`。
许可来源映射、npm 补充清单、Cargo 补充清单以及规范文本例外/证据分别位于
`review/third-party-license-source-map.json`、
`review/npm-license-text-supplements.json` 与
`review/cargo-license-text-supplements.json`，以及
`review/canonical-license-text-policy.json` 与
`review/canonical-license-text-supplements.json`。
`npm run licenses:notices:check` 会重新扫描当前安装依赖并拒绝过期清单、被篡改文本、
虚构的安装包集成或法务批准。草案超过 1 MB 是因为保留了包中实际携带的许可文本，
并为 11 个受控例外保留固定 SPDX 规范正文，而不是只列许可证名称。规范正文补充
不冒充上游随包文件，也不代表许可证兼容性或法律批准。

## 第三方 NOTICE 的三层状态

为了避免把工程集成误写成法律结论，第三方 NOTICE 按三层状态分别记录：

1. **已配置**：`src-tauri/tauri.conf.json` 已把
   `docs/THIRD_PARTY_NOTICES.md` 映射到安装目录
   `licenses/THIRD_PARTY_NOTICES.md`，但配置本身不能证明某个既有安装包已经包含该文件。
2. **安装字节已验证**：NSIS 与 MSI 真实生命周期脚本会在卸载前调用
   `scripts/verify-installed-notice.mjs`，确认安装后文件存在、非空、为严格 UTF-8，
   且与当前源 NOTICE 逐字节一致。两种安装器都通过后生成
   `output/WeatherPoem_0.2.0_INSTALLED_NOTICE.json`；运行
   `npm run licenses:notices:installed:check` 可重新验证版本、源文件和发布物哈希。
3. **法律许可已批准**：规范文本例外、复合许可义务、具体内容和资产来源均已完成
   具名复核，并由下方责任人签署。机器生成的安装字节证据不能替代这一层。

当前第一层已经完成；第二层中，当前 NSIS 真实安装目录的 NOTICE 已与源文件逐字节
校验通过，MSI 行政镜像也已验证载荷，但管理员 MSI 真实安装、修复、卸载和安装后
NOTICE 校验仍待完成，因此聚合证据
`output/WeatherPoem_0.2.0_INSTALLED_NOTICE.json` 保持 `partial`。第三层也仍未
完成。人工 Windows 与 production 发布门禁会拒绝缺失、单安装器覆盖或过期的安装
字节证据，RQT-23 继续保持 `partial`。

## 外部数据与服务

### Open-Meteo

当前客户端直接请求 Open-Meteo 天气预报。其官方许可页声明天气数据采用
CC BY 4.0，并要求提供署名和链接；如果修改数据，也要说明。设置页“版本与信任”
现已显示 Open-Meteo、CC BY 4.0、许可入口，以及“选择字段、天气代码映射为中文
情境和本地缓存，不改写接口数值”的处理说明。外部链接权限只允许打开官方许可页。

官方定价页区分非商业免费使用与商业客户方案。项目方尚未确认最终属于哪种服务
档位，因此完成署名仍不等于公开发布已获许可。

- 官方许可：<https://open-meteo.com/en/license>
- 官方定价：<https://open-meteo.com/en/pricing>
- 待办：保持靠近天气信息的可见署名及链接；确认非商业/商业使用性质、调用量、
  SLA 和适用方案；保存组织批准记录。

为了保留已经通过正式八小时门禁的冻结候选证据，当前不修改发布 EXE。可见署名和
官方许可入口已经实现；进入公开候选版前仍须确认服务档位、法律主体与许可义务。
任何后续二进制修改都必须形成新候选并重新生成相应性能、哈希和安装证据。

### 官方气象预警

预警网关在当前安全范围中保持关闭。启用前必须选择合法数据提供方、取得覆盖
使用和分发的授权、部署 HTTPS 网关，并验证过期、撤销和弱网链路。关闭状态不能
作为未来授权。

### OpenAI API

当前安全范围使用本地规则理由，OpenAI API 增强保持关闭。如以后启用，应由组织
确认适用协议、数据处理、密钥托管、预算和供应商流程；密钥不得进入客户端或仓库。

- 官方服务协议：<https://openai.com/policies/services-agreement/>

## 逐首底本确认最低字段

内容负责人应为每个 `workId` 补充以下信息，并由第二位复核人确认：

1. 权威底本或数字源名称、出版/维护机构；
2. 具体卷次、页码、稳定链接或馆藏标识；
3. 采用的原文与异文处理；
4. 该具体转录/数字源的版权或使用条件；
5. 审核人、复核人、日期与结论；
6. 如有争议，使用现有撤回机制停用该 `workId` 的方法。

`review/content-review-catalog.json` 中已有的 `sourceName` 和
`sourceVerified` 只代表工程字段初核，不替代上述证据。

## 具名签署

只有以下角色完成真实复核后，才能创建
`review/evidence/RQT-23-content-asset-licenses.json` 并考虑把 RQT-23 改为
`passed`：

| 角色 | 姓名 | 结论 | 日期 | 审批/证据定位 |
| --- | --- | --- | --- | --- |
| 内容权利负责人 |  |  |  |  |
| 设计资产负责人 |  |  |  |  |
| 数据服务负责人 |  |  |  |  |
| 法务复核人 |  |  |  |  |

签署结论至少应明确：

- 项目代码、文档和现代解释的权利主体及允许的分发范围；
- 120 首具体底本/转录来源均已复核，争议内容可按 `workId` 撤回；
- 图标和内联图形的原创或授权链完整；
- 当前构建不打包字体；
- Open-Meteo 署名已在候选版实现且服务档位已批准；
- 第三方 NOTICE 的规范文本例外和义务已复核，最终文件已随安装包提供；
- 官方预警/OpenAI 等关闭服务不会被误写成已授权，启用需重新审批。

原始合同、个人信息、密钥和不可公开的第三方材料不要提交到仓库。证据摘要只引用
组织可访问的无凭据 HTTPS 工单/审批页或仓库内脱敏文件。
