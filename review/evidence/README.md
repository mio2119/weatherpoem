# 人工与外部证据目录

此目录只保存需求追踪表中人工或外部门禁的具名验收摘要。原始合同、密钥、
个人敏感信息、完整第三方响应和不可公开的日志不得提交到仓库；可以使用无凭据的
HTTPS 审批/工单地址作为 `evidenceItems[].locator`。

## 使用顺序

1. 在 `review/requirements-traceability.json` 找到对应 `RQT-xx`；
2. 按门禁的 `exitCriterion` 完成实际工作，不能先写结论；
3. 从 `_signoff.example.json` 复制一份与门禁约定文件名一致的 JSON；
4. 填写真实执行人、批准人、时间、证据定位和限制；
5. 执行门禁列出的验证命令；
6. 确认证据通过后，才把 `currentStatus` 改为 `passed`，清空 `issue` 和
   `nextAction`；
7. 运行：

```powershell
cd E:\weatherpoem
npm run requirements:generate
npm run requirements:check
```

`requirements:check` 会拒绝匿名人名、`TBD`/“待定”等占位值、未来时间、无凭据
HTTPS 之外的外部地址、不存在的仓库证据、版本不一致和空证据列表。它只能校验
证据契约，不能替代批准人对原始材料真实性的责任。

设备矩阵、内容专家 CSV、管理员 MSI、自启动重启和 Authenticode 等已有专用
机器门禁的项目，还必须先通过对应专用命令，不能只提交本目录中的摘要。

## RQT-16 会话测量真机验收

从 `RQT-16-pilot-session-measurement-validation.template.json` 开始，先绑定冻结候选
的 EXE/MSI 哈希，再由真实质量负责人、隐私负责人和一名非开发人员在 Windows
真机完成五个场景。所有 `status`、隐私断言、人员、时间和证据定位都填写完成并
批准后，另存为 `RQT-16-pilot-consent-measurement.json`。空模板或仅有自动化测试
不能把 RQT-16 改为 `passed`。
