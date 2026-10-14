# WeatherPoem AI 推荐理由服务

该服务只负责把已经由本地规则选定的作品与当天语境连接成一句话。它不能重新选诗，
不能修改作品事实，也不是桌面应用可用性的前置依赖。服务拒绝、超时或不可用时，客户端
继续展示本地规则理由。

OpenAI API 密钥只存在于该服务的部署环境中，不得进入 Vite 环境变量、Tauri 配置、
安装包、日志或客户端请求。

## 已实现的边界

- 客户端契约版本为 `1.1`，包含内容版本和规则版本；
- 服务从 `server/reason-catalog.json` 读取 120 首已发布作品的篇名、作者、朝代和摘要；
- 客户端传入的作品事实必须与服务目录逐字段一致；
- 节日、节气、季节、时段、天气种类和天气标签均使用白名单；
- 雷暴、未知天气、日期异常、未知字段和超过 12 KB 的请求直接拒绝；
- 只把标准化作品事实和当天语境发送给模型，不发送规则回退理由、经纬度、收藏或历史；
- OpenAI Responses API 请求设置 `store: false`；
- 使用 `text.format` 严格 JSON Schema，将 `workId` 锁定为已选作品；
- 对拒绝、不完整输出、错作品、链接、换行、模型自称和 6—40 字限制再次校验；
- 默认每个来源每分钟 20 次，完全相同的标准化请求缓存 24 小时；
- 日志只记录随机请求 ID 和结果代码，不记录请求正文、理由或 API 密钥。

上述 Responses API 与严格结构化输出方式依据 OpenAI 官方
[Structured Outputs 指南](https://developers.openai.com/api/docs/guides/structured-outputs)。
模型必须由部署者通过 `OPENAI_MODEL` 显式选择；示例使用适合高频短文本任务的
`gpt-5.6-luna`，上线前仍需用真实语料评估质量、时延和成本。

## 本地验证

无需真实 API 密钥：

```powershell
cd E:\weatherpoem
npm run reason:catalog
npm run reason:check
```

`reason:catalog` 从正式发布目录机械生成服务端事实目录。`reason:check` 会先确认目录未
过期，再确认评测集仍与内容版本一致，并运行契约、OpenAI 请求、输出解析、来源限制、
缓存、限流、评测运行器和服务启动测试。

如修改任何作品事实或版本号，必须重新执行 `npm run reason:catalog` 并提交更新后的
`server/reason-catalog.json`，再执行 `npm run reason:eval:catalog` 更新评测集。
常规 `npm run check` 已包含两项一致性检查。

## 发布前评测

项目使用版本化的本地评测集，不依赖即将停用的旧 Evals 平台。设计依据 OpenAI 官方
[Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)：
评测应贴近真实任务分布，覆盖典型、边缘和对抗场景，自动指标需要由人工判断校准并持续
扩充。当前 `server/reason-evals.json` 包含 47 个场景，覆盖：

- 8 个传统节日；
- 24 个节气；
- 11 类允许生成理由的天气；雷暴与未知天气继续由安全门禁拒绝；
- 春夏秋冬和清晨、白天、傍晚、夜晚；
- 当前内容版本、规则版本和 120 首服务端事实目录。

无需密钥即可检查评测集、运行器和人工评分契约：

```powershell
npm run reason:eval:check
```

正式评测必须针对候选 HTTPS 部署执行。为避免 24 小时缓存掩盖模型波动，评测实例临时
设置 `CACHE_TTL_MS=0`、`CACHE_MAXIMUM=0`，并把
`RATE_LIMIT_PER_MINUTE` 调高到本次评测请求数以上；评测结束后恢复生产缓存和限流。
将实际部署地址及精确允许来源注入当前 PowerShell 会话，然后运行三轮：

```powershell
if (-not $env:REASON_EVAL_URL) { throw "请先设置候选 HTTPS 理由服务地址" }
if (-not $env:REASON_EVAL_ORIGIN) { throw "请先设置服务端允许的精确 Origin" }
$runDir = 'E:\weatherpoem\output\reason-evals\release-candidate'
npm run reason:eval:run -- `
  --url $env:REASON_EVAL_URL `
  --origin $env:REASON_EVAL_ORIGIN `
  --repetitions 3 `
  --concurrency 2 `
  --timeout-ms 2500 `
  --output $runDir
```

运行器只调用 WeatherPoem 理由网关，不接触 OpenAI API 密钥。它输出 `report.json`
和 `human-review.csv`。评审人逐行填写语境贴合、作品准确、自然克制三项 1—5 分，
以及事实错误、安全问题、具名评审人和备注，再执行：

```powershell
npm run reason:eval:review -- `
  "$runDir\report.json" `
  "$runDir\human-review.csv"
```

正式发布阈值固定为：

- 结构、作品标识、长度和安全格式自动通过率 100%；
- P95 响应时间不超过 2,000 ms，为桌面端 2.5 秒降级留出余量；
- 至少 90% 输出的三项人工评分均不低于 4 分；
- 事实错误 0，安全问题 0；
- 使用无缓存三轮结果评估波动，不以单次演示代替；
- 服务日志中的 `weatherpoem_reason_usage` 只记录模型和 token 数，不记录输入或输出；
  根据当次 OpenAI 项目账单与 token 汇总核算预算，不在代码中硬编码价格。

## 本地启动

复制 `server/.env.example` 的变量到进程环境，至少设置：

```powershell
# 先由操作系统或密钥管理器向当前进程注入 OPENAI_API_KEY
if (-not $env:OPENAI_API_KEY) { throw "请先安全注入 OPENAI_API_KEY" }
$env:OPENAI_MODEL = 'gpt-5.6-luna'
$env:ALLOWED_ORIGINS = 'http://localhost:1420,http://tauri.localhost'
npm run reason:start
```

不要把真实密钥写入 `.env.example`、PowerShell 历史共享文件或客户端
`VITE_*` 变量。开发健康检查：

```text
GET http://127.0.0.1:8787/health
```

客户端开发配置：

```text
VITE_REASON_API_URL=http://127.0.0.1:8787/v1/reason
VITE_REASON_TIMEOUT_MS=2500
```

## 容器部署

```powershell
docker build -f server/Dockerfile -t weatherpoem-reason:0.2.0 .
docker run --rm -p 8787:8787 `
  -e OPENAI_API_KEY `
  -e OPENAI_MODEL=gpt-5.6-luna `
  -e ALLOWED_ORIGINS=http://tauri.localhost,tauri://localhost `
  weatherpoem-reason:0.2.0
```

生产环境必须在容器前配置 HTTPS 反向代理，并完成：

1. 将 `ALLOWED_ORIGINS` 收窄到真实桌面来源，不使用 `*`；
2. 将限流从单实例内存迁移到网关或共享存储；
3. 配置密钥托管、轮换、预算上限、请求超时、告警和审计；
4. 在 Tauri `connect-src` 中只加入部署后的唯一 HTTPS 源；
5. 把 `VITE_REASON_API_URL` 编译为该源的 `/v1/reason`；
6. 不记录正文、用户历史、经纬度、API 响应全文或 Authorization；
7. 使用 47 场景、三轮无缓存运行和具名人工评分完成发布评测；
8. 汇总 `weatherpoem_reason_usage` token 日志与项目账单，确认预算上限；
9. 验证模型拒绝、429、5xx、超时和断网时客户端始终保留规则理由。

## HTTP 契约

请求：

```json
{
  "schemaVersion": "1.1",
  "contentVersion": "2026.07.1",
  "ruleVersion": "1.2.2",
  "work": {
    "id": "zhao-shi-xiu-yue-ke",
    "title": "约客",
    "author": "赵师秀",
    "dynasty": "宋",
    "summary": "梅雨夜的等待，被蛙声与灯花写得格外清晰。"
  },
  "context": {
    "localDate": "2026-07-24",
    "solarTerm": "大暑",
    "season": "summer",
    "timePeriod": "night",
    "weather": {
      "kind": "overcast",
      "label": "阴"
    }
  },
  "fallbackReason": "阴云与夏雨相接，让等待也有了清晰的声音。",
  "constraints": {
    "language": "zh-CN",
    "maxCharacters": 40,
    "noNewlines": true,
    "noDisasterRomanticization": true
  }
}
```

成功响应：

```json
{
  "workId": "zhao-shi-xiu-yue-ke",
  "reason": "阴云与夏雨相接，让等待也有了清晰的声音。"
}
```

失败响应不返回未经校验的模型文本。客户端对所有非 2xx、超时和格式错误直接使用请求中
已有的本地规则理由。
