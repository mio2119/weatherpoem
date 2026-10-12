# WeatherPoem 签名更新实施计划

更新时间：2026-07-24  
适用基线：WeatherPoem 0.2.0 / `trial` / `unsigned-trial`  
当前结论：实施与验收方案已就绪，updater、密钥和端点均未启用。

机器可读计划位于 `review/signed-updater-plan.json`，执行
`npm run updater:plan:check` 可确认计划仍绑定当前发布清单、Tauri 配置、
Cargo 锁文件和 Rust 初始化代码。

## 为什么暂不直接接入

当前正式八小时性能采样绑定已冻结的 0.2.0 EXE。此时增加插件、配置或更新 UI
会产生新的候选二进制，使现有性能报告不能代表新版本。因此本轮只完成安全设计、
责任边界和测试矩阵；待八小时采样结束、项目发起人确认公开发布范围并指定密钥
责任人后，再进入实现。

## 官方机制边界

按 Tauri v2 当前官方文档：

- `bundle.createUpdaterArtifacts` 应设为 `true`；本项目没有 v1 客户迁移包袱，
  不采用 `"v1Compatible"`；
- updater 公钥内容固化在配置中，不能写成文件路径；
- production 更新端点必须使用 HTTPS，不启用
  `dangerousInsecureTransportProtocol`；
- 端点只依赖官方变量 `{{current_version}}`、`{{target}}` 和 `{{arch}}`；
- Windows 使用 `passive` 安装模式，保留可见进度；
- 私钥只从受控发布环境注入
  `TAURI_SIGNING_PRIVATE_KEY` 和可选密码变量，不进入源码、客户端、日志或普通
  工作台；
- updater 包签名与 Windows Authenticode 是两套独立门禁，二者都必须通过。

官方依据：

- <https://v2.tauri.app/plugin/updater/>
- <https://v2.tauri.app/reference/cli/#signer>
- <https://v2.tauri.app/distribute/sign/windows/>

## 实施顺序

1. 项目发起人指定发布、后端和安全责任人；
2. 决定更新域名、托管方式、可用性和分阶段发布策略；
3. 在组织机密存储中生成并保管 updater 私钥，配置恢复责任人；
4. 在客户端固化公钥和 HTTPS 端点，加入 updater 插件与最小权限；
5. 生成更新产物和 `.sig`，再验证 Windows Authenticode、时间戳和发布清单；
6. 上传不可变版本化产物，最后原子切换更新元数据；
7. 从公开地址重新下载，对签名、哈希、平台、安装和用户数据进行独立复验。

私钥泄露时不能直接把客户端公钥“远程改掉”。轮换必须先发布一个由旧私钥签署、
内嵌新公钥的桥接版本，并为未安装桥接版本的客户端保留明确支持路径。

## 必测正反场景

计划固定了 12 个场景：

1. 已是最新版；
2. 有效签名升级；
3. 更新包字节损坏；
4. 签名字段篡改；
5. 错误私钥签名；
6. 离线、超时和 TLS 失败；
7. 主端点非 2XX 后的备用端点；
8. 降级元数据拒绝；
9. 更高补丁版本的前向修复回滚；
10. 平台/架构不匹配；
11. 权限不足和文件占用；
12. 公钥轮换桥接版本。

每个场景都必须绑定具名执行人、时间、客户端日志、服务端响应摘要、更新包/签名/
安装包哈希和用户数据前后对比。不得用单元测试代替真实 Windows 更新安装。

## 回滚原则

普通事故采用“前向修复”：发布更高补丁版本恢复稳定行为，不允许用低版本覆盖
高版本。二进制撤回时先停止更新元数据和公开下载；已安装客户端继续使用当前本地
能力。只有经过单独风险批准的数据格式兼容场景，才讨论人工降级，且不能由默认
updater 流程静默执行。

## 通过条件

RQT-20 只有同时满足以下条件才能从 `partial` 改为 `passed`：

- 插件、公钥、HTTPS 端点和更新产物已真实部署；
- 私钥托管、恢复、轮换和泄露响应有具名负责人；
- 12 个场景在独立 Windows 环境全部执行，P0/P1 为零或有具名接受；
- 更新产物签名、Windows Authenticode、SHA-256 和公开元数据相互一致；
- 安装后设置、收藏、反馈和内容缓存按设计保留；
- `review/evidence/RQT-20-signed-updater.json` 具名、带时间且可访问。
