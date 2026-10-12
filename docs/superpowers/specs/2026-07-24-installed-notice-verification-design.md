# WeatherPoem 安装后 NOTICE 验证设计

日期：2026-07-24  
状态：待用户复核  
适用版本：WeatherPoem 0.2.0 内部受控试用候选

## 1. 背景与目标

当前工程已经完成三件事：

- 生成 `docs/THIRD_PARTY_NOTICES.md`；
- 在 `src-tauri/tauri.conf.json` 中把该文件映射到安装资源目录
  `licenses/THIRD_PARTY_NOTICES.md`；
- 在应用中提供固定命令，用系统默认程序打开安装后的 NOTICE。

这些证据只能证明“构建配置计划携带 NOTICE”，不能证明 NSIS 和 MSI
安装完成后确实存在该文件，也不能证明安装后的字节内容与当前草案一致。

本设计增加一个安装后验证闭环。目标是：

1. 验证 NSIS 和 MSI 安装目录均存在目标 NOTICE；
2. 验证目标文件可按严格 UTF-8 读取且非空；
3. 验证安装后文件与当前 `docs/THIRD_PARTY_NOTICES.md` 的 SHA-256 完全一致；
4. 把结果绑定到当前发布物哈希、应用版本和 NOTICE 源文件哈希；
5. 让人工 Windows 发布验证和 production 发布验证拒绝缺失、过期或不一致的证据。

本验证不证明许可证文本已经全部补齐，不替代许可证兼容性判断，也不代表具名法务批准。

## 2. 方案选择

采用“独立校验核心 + 安装生命周期调用 + 发布门禁复核”的组合方案。

未采用的方案：

- 仅在 PowerShell 生命周期脚本中内联检查：实现分散，NSIS 与 MSI
  容易产生不同规则，也难以单元测试。
- 直接静态解包安装器：需要额外 Windows 解包工具，而且不能证明真实安装目录中的
  资源路径和读取权限正确。

组合方案使用真实安装结果，同时把字节校验和证据验证保留在可独立测试的 Node.js
模块中。

## 3. 验证边界

### 3.1 纳入范围

- NSIS 安装后的 `licenses/THIRD_PARTY_NOTICES.md`；
- MSI 安装后的 `licenses/THIRD_PARTY_NOTICES.md`；
- 当前源 NOTICE、当前版本、当前 NSIS/MSI 发布物及其 SHA-256；
- 证据文件的生成、累积、校验和过期判定；
- 人工 Windows 门禁与 production 门禁的强制检查。

### 3.2 不纳入范围

- 自动补齐仍缺少原文的第三方包；
- 自动判断复合许可证兼容性；
- 自动代表项目权利主体、内容负责人或法务签署；
- 在 8 小时长测运行期间重建或替换被测 EXE；
- 以静态 bundle 配置代替真实安装验证。

## 4. 组件设计

### 4.1 纯校验模块

新增 `scripts/installed-notice-support.mjs`，只负责确定性逻辑：

- 对源 NOTICE、安装后 NOTICE 和发布物计算 SHA-256；
- 使用严格 UTF-8 解码器读取 NOTICE，拒绝无效编码；
- 拒绝缺失、空文件或字节不一致；
- 构造单个安装器的验证记录；
- 校验聚合证据是否同时覆盖当前 NSIS 与 MSI；
- 校验版本、源 NOTICE 哈希和发布物哈希是否仍与当前工程一致。

模块不得修改安装目录，不得自动修复文件，也不得把部分结果标记为通过。

### 4.2 安装后验证命令

新增 `scripts/verify-installed-notice.mjs`。命令接收：

- 安装器类型：`nsis` 或 `msi`；
- 安装根目录；
- 对应发布物路径；
- 聚合证据输出路径。

命令在安装生命周期脚本已经确认应用可启动之后执行。每次成功验证一个安装器后，
以原子方式更新聚合证据：

`output/WeatherPoem_0.2.0_INSTALLED_NOTICE.json`

聚合文件可以先包含一项，但只有 NSIS 与 MSI 两项都存在、都绑定当前发布物且都通过时，
整体状态才是 `passed`。任何失败不得覆盖已有成功记录。

### 4.3 安装生命周期接入

- `scripts/test-nsis-lifecycle.ps1` 在 NSIS 安装成功且应用启动检查完成后调用校验命令；
- `scripts/test-msi-elevated-lifecycle.ps1` 在管理员 MSI 安装成功且应用启动检查完成后调用；
- 两个脚本继续负责卸载和原有生命周期验证，NOTICE 校验失败视为本次生命周期失败；
- `scripts/test-msi-image.ps1` 只验证 MSI 数据库结构，不代替真实管理员安装后的 NOTICE
  验证。

生命周期脚本传入显式绝对路径，不依赖当前目录、环境变量展开或安装目录猜测。

### 4.4 发布门禁接入

新增命令：

`npm run licenses:notices:installed:check`

该命令读取当前发布清单、当前 NOTICE 和聚合证据，验证：

- NSIS、MSI 两项记录均存在并通过；
- 证据中的应用版本等于 `package.json` 版本；
- 源 NOTICE SHA-256 与当前文件一致；
- 每项发布物 SHA-256 与当前发布清单一致；
- 每项安装后 NOTICE SHA-256 等于源 NOTICE SHA-256；
- `verifiedAt` 和 `generatedAt` 均为可解析的 ISO 8601 时间，且不得晚于校验机当前时间
  5 分钟以上；
- 证据 Schema 只允许字节验证范围，不提供 `legalApproved`、`licenseComplete`
  或含义相同的字段。

接入规则：

- 普通 `npm run release:verify` 保持可用于自动构建和内部静态检查，不要求管理员安装证据；
- `npm run release:verify:manual-windows` 强制执行安装后 NOTICE 门禁；
- `npm run release:verify:production` 强制执行安装后 NOTICE 门禁；
- 校园试点门禁沿用 `release:verify:manual-windows`，因此自动继承该要求。

## 5. 证据结构

聚合证据使用独立 Schema 版本，至少包含：

- `schemaVersion`
- `status`
- `appVersion`
- `noticeSource.relativePath`
- `noticeSource.sha256`
- `noticeSource.byteLength`
- `installers.nsis`
- `installers.msi`
- `generatedAt`

每个安装器记录至少包含：

- `artifact.relativePath`
- `artifact.sha256`
- `installedNotice.relativePath`
- `installedNotice.sha256`
- `installedNotice.byteLength`
- `utf8Readable`
- `exactByteMatch`
- `verifiedAt`

证据不得保存用户主目录、用户名或临时安装账户等不必要的绝对路径。安装根目录只用于
运行时定位，报告中仅保存相对于安装根目录的固定 NOTICE 路径。

## 6. 失败处理

以下任一情况必须失败并给出可操作的中文错误：

- 安装目录或 NOTICE 文件不存在；
- NOTICE 是空文件；
- NOTICE 不是严格 UTF-8；
- 安装后 NOTICE 与源文件哈希不同；
- 发布物不存在或哈希与当前清单不同；
- 聚合证据缺少 NSIS 或 MSI；
- 证据属于旧版本、旧发布物或旧 NOTICE；
- 证据 Schema 无效或状态被人工篡改。

失败时不删除安装目录，不改写 NOTICE，不修改发布物，也不生成 `passed` 证据。

## 7. 测试策略

严格按测试驱动开发执行。

### 7.1 单元与契约测试

先写失败测试，再实现最小逻辑，覆盖：

1. 缺失安装后 NOTICE 时失败；
2. 空文件时失败；
3. 无效 UTF-8 时失败；
4. 字节或哈希不一致时失败；
5. 单个安装器成功时只得到部分聚合状态；
6. 当前 NSIS 与 MSI 均通过时整体通过；
7. 旧版本、旧源 NOTICE 或旧发布物证据被拒绝；
8. 报告不包含安装根目录和用户信息；
9. PowerShell 生命周期脚本确实调用统一校验命令；
10. manual-windows 与 production 门禁强制执行聚合证据检查，而普通静态验证不强制。

### 7.2 真实验证

8 小时长测结束并正式判定后：

1. 重建便携 EXE、NSIS 和 MSI；
2. 在干净测试账户执行 NSIS 生命周期；
3. 在获批管理员账户执行 MSI 生命周期；
4. 运行 `npm run licenses:notices:installed:check`；
5. 运行 `npm run release:verify:manual-windows`；
6. 重新生成就绪报告，确认 RQT-23 只增加“安装后 NOTICE 已验证”证据，
   仍诚实保留缺失许可证文本和法务签署事项。

## 8. 验收标准

设计实现完成的机器验收标准是：

- 新增契约测试经历明确的红、绿阶段；
- 所有新旧测试通过；
- NSIS 和 MSI 真实安装记录都与当前发布物哈希绑定；
- 安装后 NOTICE 与源 NOTICE 完全一致；
- manual-windows 和 production 发布验证会拒绝缺失或过期证据；
- 普通静态发布验证不被管理员权限要求阻塞；
- 现有 8 小时长测候选未在运行中被替换；
- 就绪报告不把机器验证误写为许可证完整或法务批准。

只有上述机器标准通过，才能关闭“安装包实际携带 NOTICE”这一子项。RQT-23
整体仍需补齐剩余许可文本、确定项目发布许可并获得具名法务复核。
