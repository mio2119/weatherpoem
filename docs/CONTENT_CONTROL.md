# WeatherPoem 内容撤回控制

更新时间：2026-07-24

## 1. 目标

内容撤回清单用于在重新构建安装包之前停止传播已发现问题的诗词。它优先于当日状态、
历史和收藏缓存，但不删除用户数据。源码中的 `retracted` 状态仍是永久修订路径，
远端清单不是内容审核流程的替代品。

## 2. 清单契约

正式响应必须符合 `server/content-withdrawal.schema.json`：

```json
{
  "schemaVersion": "1.0",
  "contentVersion": "2026.07.1",
  "revision": 12,
  "issuedAt": "2026-07-24T10:00:00+08:00",
  "suspendRecommendations": false,
  "withdrawnWorkIds": ["wang-an-shi-yuan-ri"]
}
```

- `contentVersion` 必须与客户端内置目录完全一致；
- `revision` 只能递增，同修订号不同内容也会被拒绝；
- `issuedAt` 不能超过客户端时间十分钟；
- `withdrawnWorkIds` 必须唯一且全部存在于当前目录；
- 不接受原因、HTML、链接或其他未知字段；
- `suspendRecommendations: true` 用于 P0/P1 事故期间暂停全部诗笺；
- 清单不含用户、城市、设备或事故内部描述。

客户端请求只包含 `contentVersion` 和 `appVersion`。`204` 表示没有新修订，客户端
继续使用最后一次有效清单，不能理解为“清空撤回列表”。

## 3. 客户端行为

1. 启动展示、托盘重新打开和每三十分钟刷新时读取清单；
2. HTTPS 失败、超时、非法响应、旧修订或同修订冲突时保留上次有效缓存；
3. 撤回作品不进入推荐候选，也不再出现在收藏内容列表；
4. 当日正在展示的作品被撤回时，立即清空正文与阅读页，显示“今日内容正在校正”；
5. 仍有有效作品时允许换一首；全局暂停或无有效作品时不显示无效按钮；
6. 用户的收藏标识、历史和反馈不会因内容撤回被删除。

“清除个人数据与设置”不会清除撤回清单缓存。该缓存属于安全控制状态，避免用户清除
数据或临时断网后让已撤回作品重新出现。

## 4. 端点与 CSP

配置：

```dotenv
VITE_CONTENT_CONTROL_URL=https://content.example/v1/withdrawals
VITE_CONTENT_CONTROL_TIMEOUT_MS=2500
```

正式渠道只接受无用户名、口令、查询参数和片段的 HTTPS URL。`trial` 渠道额外允许
本机 `127.0.0.1`/`localhost` HTTP 端点用于受控演练。发布构建还必须把唯一生产
源加入 `src-tauri/tauri.conf.json` 的 `connect-src`；不得使用通配域名。

HTTPS 网关负责认证发布人、双人批准、原子替换、审计日志和访问监控。当前客户端只
依赖 TLS 与固定 CSP 源，尚未验证清单的独立数字签名，因此公开发布前仍需安全负责人
确认该风险或补充签名机制。

## 5. 自动证据

```powershell
cd E:\weatherpoem
npm run content:withdrawal:drill
npm run content:withdrawal:check
```

报告：

- `output/WeatherPoem_0.2.0_CONTENT_WITHDRAWAL_DRILL.json`

自动演练验证当前目录中的一首作品能被远端清单排除、当日状态进入校正、断网缓存
继续生效、旧修订和同修订冲突不能恢复内容。报告与目录、服务实现和 JSON Schema
的 SHA-256 绑定。

报告明确保留四项限制：未验证独立签名、未连接生产网关、未操作真实客户端、
未取得具名值守签署。因此自动演练通过不能把 RQT-12 或 RQT-24 改为人工通过。

## 6. 永久修订

确认问题后仍须：

1. 将 `src/data/content-reviews.ts` 对应作品改为 `retracted` 并记录原因；
2. 更新内容版本，重新完成内容校验、专家复核和 AI 理由目录导出；
3. 构建新客户端或内容包，验证撤回作品不在内置目录；
4. 只有更正内容完成双人审核后，才可在更高 `revision` 中移除撤回 ID；
5. 保存事故时间线、更正说明、清单前后版本和具名批准证据。
