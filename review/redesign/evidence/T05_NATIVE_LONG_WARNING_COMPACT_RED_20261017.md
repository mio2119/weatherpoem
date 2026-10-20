# T05 原生长提醒低窗口首屏反例

- 基线内部候选：`.work/redesign-reveal-copy-20261017/release/weatherpoem.exe`，SHA-256 `6D15856C4A8F10706A76A54C5F53EC1F1AC25F433EF1F31E3B15B3A8D2C5B32F`。
- 隔离条件：独立临时资料；只对测试进程阻断天气域名并注入明确标注为非真实预警的长文排版演练；不修改 Windows 显示设置，而是在该测试窗口内暂时强制设为 320×260 逻辑像素，退出后销毁临时资料。
- [基线几何报告](./T05_NATIVE_LONG_WARNING_COMPACT_20261017.json)的旧断言只覆盖可滚动、无横向溢出和页尾可达，因此返回 `passed`；它**不代表视觉签收**。逐张查看[首屏](./T05_NATIVE_LONG_WARNING_COMPACT_20261017_compact_warning_top.png)与[底部](./T05_NATIVE_LONG_WARNING_COMPACT_20261017_compact_warning_bottom.png)后发现，首屏只有装饰图标和标题，安全说明与预警标题均在折叠线下。
- 随后在原生测试脚本加入“首屏安全说明完整可见、预警标题至少进入首屏”的断言。同一基线 EXE 运行失败：`AssertionError: Compact warning hides the safety explanation on first view`；没有为失败试验生成或覆盖正式通过报告。
- 这是极小工作区的受控几何与画面反例，不证明真实多显示器、系统缩放或实际低工作区自动定位。
