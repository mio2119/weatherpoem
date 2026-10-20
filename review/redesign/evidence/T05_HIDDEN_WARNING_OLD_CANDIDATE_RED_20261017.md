# T05 同日托盘找回后新增安全提醒：旧候选原生反例

- 旧内部 EXE：`.work/redesign-warning-copy-20261017/release/weatherpoem.exe`，SHA-256 `4507FF5002D3C4E749C6F411D371D3331C30E0AC5F438353634D19FD371BC029`。
- 隔离方式：独立临时 SQLite/WebView2 资料；仅该进程阻断 Open-Meteo 域名，不更改系统网络、时间、显示设置或真实资料；先显示离线诗笺，隐藏后向临时 WebView2 天气缓存注入明确标记的非真实安全提醒，再由第二实例找回。
- 复现命令：`node scripts/test-redesign-native-reveal.mjs .work/redesign-warning-copy-20261017/release/weatherpoem.exe review/redesign/evidence/T05_OLD_CANDIDATE_HIDDEN_WARNING_RED_20261017.json --cached-warning --second-instance`。
- 第一次运行失败：`Timed out waiting for native cached safety warning`。加入失败诊断后第二次仍在约 25 秒等待后失败，原样诊断为：

```text
Timed out waiting for native cached safety warning; diagnostic: {"poemTitle":"秋词","warning":false,"loading":false,"observed":[{"visible":"visible","poem":false,"loading":true,"correction":false,"warning":false},{"visible":"visible","date":"10月17日","poem":true,"loading":false,"correction":false,"warning":false}]}
```

结论：旧候选在同日托盘找回时复查内容撤回，却没有重查天气安全状态；遮挡解除后重新显示旧诗。该失败发生在隔离缓存演练，不等同于生产网关时序，也不证明原生合成器每一帧。失败命令没有生成 `T05_OLD_CANDIDATE_HIDDEN_WARNING_RED_20261017.json`，不得把缺失的 JSON 当作通过报告。
