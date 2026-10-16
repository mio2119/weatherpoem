# T04 小诗笺、阅读窗与显示策略自验收

状态：**部分通过**。窗口模式与焦点策略已在源码和模拟原生接口中实现；隔离的 Windows 11 原生窗口已完成诗笺/阅读切换、自动启动不抢焦点、托盘找回，以及阅读尺寸的同资料重启持久化观察。开机时的全屏前台探测与保守托盘降级已实现并通过纯逻辑测试；真实全屏演示、多屏/DPI 和更完整的进程生命周期仍须独立实测。

目标行为与问题：E01、E02、E04。保持单一 Tauri/WebView 窗口，在 `setup / glance / reading / safety` 四种状态之间切换。自动展示不主动请求焦点；手动托盘打开仍可取得焦点。诗笺约 392×320 逻辑像素，阅读约 560×720 且可拖动调整；安全/撤回提示不压进诗笺短窗。

实际修改：`src/services/desktop.ts`、`src/App.vue`、`src/types.ts`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/default.json`、`src-tauri/Cargo.toml`、`src-tauri/src/foreground.rs` 和桌面服务测试。原生验证发现缺少窗口读写尺寸权限，现已补齐。Windows GNU 调试构建不再生成本桌面应用不使用的 `cdylib`，只保留 `rlib`。`D:\纯净工作台` 未参与源码开发。旧候选没有重建或替换。

自动检查：

- 窗口尺寸计算覆盖普通工作区和 800×600 矮工作区，阅读尺寸按可用工作区收敛；损坏的已保存尺寸回退默认值。
- 模拟 Tauri 窗口接口验证同一窗口在诗笺状态不可拖动调整、阅读状态可调整，诗笺定位仍在工作区右下角；自动展示只调用显示，不调用取焦点，手动展示调用取焦点。
- 用户拖动阅读窗后以逻辑像素写入现有设置存储；再次展开使用该尺寸。旧设置缺少尺寸字段时使用默认值；数据清除仍清除设置记录。
- 开机自动启动时读取当前前台窗口与其所在显示器的完整边界；明确覆盖显示器或探测失败时，不自动展示诗笺，保留托盘供用户主动打开。桌面/Shell 窗口不误认全屏。普通手动启动不应用该自动避让。Rust 纯几何测试覆盖副屏负坐标、普通最大化但保留任务栏和无效矩形；前端测试覆盖自动启动的 `full-screen`/`unknown` 与手动打开。这是规则与编译证据，尚不是 PowerPoint/游戏等真实全屏走查。
- 原生 Windows 11 10.0.26100、100% 缩放、隔离 profile：竖排诗笺观察到约 404×513 窗口；返回展开阅读后再次返回诗笺，作品仍为《黄鹤楼》；切换横排后收敛到约 404×407。阅读窗约 560×720，全文和按需展开的背景可访问。该观察是开发窗口实测，不是发行候选、跨 DPI 或全屏焦点证明。
- 本轮 `npm.cmd run lint`、`npm.cmd run typecheck`、完整 `npm.cmd run test`（24 文件、131 项）、`npm.cmd run build`、Rust `cargo check`、`cargo build --no-default-features`、`cargo fmt --check` 与 `cargo test --lib`（5 项，含前后端枚举序列化契约）通过。完整工程检查仍受 T00 记录的旧内容撤回演练有效期阻断。

2026-10-15 在用户许可范围内新增**当前源码隔离原生实测**：Windows 11、单屏 1920×1080、工作区 1920×1032、96 DPI（100%）。以当前 `5a57ced91e7a7599426bbc71442671ead4b7ebc6` 构建独立内部 EXE `.work/redesign-native-20261015/release/weatherpoem.exe`，SHA-256 `064E619229B3B457752AFAF70D62246B62C5E59327AC97FC6FD8012E69847701`，未覆盖旧 EXE，也没有生成 NSIS/MSI。专用临时资料预置北京、无自启偏好、受控离线天气；用 `--autostart` 仅模拟启动入口，不写真实 Windows 启动项。就绪期间原前台 PID 未变，产品未取得前台焦点；手动操作后诗笺外框 408×438、阅读外框 576×729。把阅读窗通过 Win32 `MoveWindow` 调到 640×640，返回诗笺 408×438，再展开 640×640；隔离 SQLite 保存的内框尺寸为 624×631，用同一资料终止并重启后再次展开，外框仍为 640×640。隐藏到托盘时进程存活；最后一次从 Windows 隐藏图标区对准确名称 `WeatherPoem 今日诗笺` 做有界单击，窗口找回且取得焦点。完整机器观测见 [原生窗口报告](./evidence/T04_NATIVE_WINDOW_20261015.json)，同一 EXE 的有效隔离运行截图见[诗笺](./evidence/T04_NATIVE_GLANCE_20261015.png)与[阅读](./evidence/T04_NATIVE_READING_20261015.png)；诗笺截图来自本批较早的成功运行，最终报告因未能在截图时临时前置窗口而省略诗笺截图，并未用该旧图代替最终尺寸/焦点测量。

该路径的中间诊断曾两次出现托盘坐标点击后 10 秒内未见窗口、另有 UI Automation Invoke 可找回却未观察到焦点；最终有一次完整通过。因此这里只能说**已观察到可找回且可取得焦点，稳定性未证实**，不能把多次重跑中的超时删掉。坐标点击脚本后来发现有误触风险，已停用，见下文；现行脚本结束时只关闭自己启动的进程并清理核对过前缀的临时资料。一次早期异常退出留下专用系统临时目录 `WeatherPoem.Performance.Window.696be92521f54dc6a0e12efcadce782c`；清理命令被当前工具策略拒绝，暂保留，不是用户真实资料。尺寸调整由 API 触发，不等同于用户鼠标拖边。未安装/卸载、未变更真实收藏、启动项或显示设置。

同日后续追查修正了对“托盘偶发超时”的解释：Windows 11 隐藏图标区会把 `WeatherPoem 今日诗笺` 暴露为可访问按钮，但其报告的边界中心在一次诊断中由 `FromPoint` 命中 `TopLevelWindowForOverflowXamlIsland` 容器，而不是对应按钮，截图也显示有相邻图标；据此不能安全地把边界中心当作物理点击目标，更不能把这种脚本超时直接算作产品托盘失败。[命中诊断](./evidence/T04_TRAY_REPLAY_4_20261015.json)保留了此反例。已将复测脚本改成仅对准确名称、类型和类名的按钮调用 UI Automation `InvokePattern`，禁止再用坐标点击其他托盘图标；同时拒绝覆盖旧报告与截图。该路径在**相同 EXE 哈希**下连续三次找回窗口、取得前台焦点并在重启后保持 640×640 阅读窗，见[第 1 次](./evidence/T04_TRAY_INVOKE_1_20261015.json)、[第 2 次](./evidence/T04_TRAY_INVOKE_2_20261015.json)、[第 3 次](./evidence/T04_TRAY_INVOKE_3_20261015.json)。这证明程序化调用路径在这三次中可用，不等同于真人手指/鼠标点击的长期稳定性；不改动产品代码，也不把 A4 提升为通过。

尚未证实：Windows 10 原生行为、自动显示有无闪屏、125/150/200% 缩放、混合 DPI 多屏定位、真实全屏/演示保守避让、用户鼠标拖边、托盘反复点击稳定性、最小化/第二实例与安全长文案。真实全屏不能用纯几何测试代替。A4 因这些关键条件为**部分通过**；下一次先做具名全屏演示或低工作区原生场景，不能把本次单屏 100% 结果外推为设备矩阵。

本任务只有未发布的调试 EXE，没有新发行候选；不能使用 T00 旧哈希证明窗口新形态。下一步仍须对 T05 的真实长短文本、T09 的设备与焦点矩阵形成可复现证据。

2026-10-15 对隐藏旧诗的修复又构建了内部候选 `.work/redesign-reveal-20261015/release/weatherpoem.exe`，SHA-256 `C69C991F182DE286623F9DBA379C92FA8DA7B597ACB28886D8FFF609F525A015`。同一候选用临时资料重跑[原生窗口报告](./evidence/T04_NATIVE_WINDOW_REVEAL_20261015.json)：自动出现未夺取前台焦点，程序化 UI Automation 精确调用托盘图标后窗口可找回且取得焦点；诗笺外框 408×372、阅读 576×729，调整至 640×640 后重启仍可恢复该阅读尺寸。该脚本使用 Win32 `MoveWindow`，不是手拖；托盘用 InvokePattern，不是人手点击。窗口隐藏→隔离跨日无旧诗闪现的补充见 T01；没有把 100% 单屏与一次托盘调用外推为 Windows 10、多 DPI、真实演示全屏或长期稳定性，A4 仍**部分通过**。

后续动效停机 CSS 修复改了候选哈希；当前 `0C6D96DF719366F9068D435D0277C2E7BC0ED72B23634143F88396BF695DF76B` 又以独立资料完成[原生焦点／托盘／尺寸报告](./evidence/T04_NATIVE_WINDOW_MOTION_STOP_20261015.json)，结果为 `focus-resize-tray-invoke-and-restart-passed`。这一次仍是 100% 单屏、程序化托盘调用和 API 调整尺寸，不把旧哈希或新一次成功扩写为全设备矩阵；A4 维持**部分通过**。

2026-10-16 稳定 Tauri 升级后，第一版内部候选 `4EA661A128AB011C63495A563DBDEB0598D463B9247C14CF52D3EA1CD67E4E00` 的[隔离窗口报告](./evidence/T04_NATIVE_WINDOW_TAURI212_20261016.json)曾完整通过。为修复最小化动效恢复问题而构建的新候选 `DB56F155495900B11E73CCFABCC4D99BFFC24F233AEBD0127772639811DD391D` 则有两次**不同失败**：[首次](./evidence/T04_NATIVE_WINDOW_TAURI212_FIX_20261016.json)在模拟自启时观测到产品取得前台焦点；[复核](./evidence/T04_NATIVE_WINDOW_TAURI212_FIX_RECHECK_20261016.json)未再抢焦点，阅读尺寸跨重启保留，但任务栏里的精确名称图标被 UI Automation 标成屏外，脚本未安全调用，托盘找回未通过。两次失败均保留，不能用旧候选的通过覆盖，也不能据此断言是新代码还是 Windows 焦点／任务栏状态所致。尚需在可控前台与任务栏条件下定位并稳定复现，A4 继续**部分通过**。

同日补充焦点专测，仍绑定新候选哈希 `DB56…`：前台为 Explorer 的[六次逐次记录](./evidence/T04_FOCUS_ONLY_01_20261016.json)均未观测到诗笺抢焦点，但这不能证明“正在输入”的情境。随后脚本创建不保存内容的临时 WinForms 输入框，不改真实设置；[有效样本 02](./evidence/T04_FOCUS_INPUT_02_20261016.json)与[有效样本 03](./evidence/T04_FOCUS_INPUT_03_20261016.json)均在输入框取得前台后启动应用，1 秒后仍保持输入焦点。另有[样本 01](./evidence/T04_FOCUS_INPUT_01_20261016.json)、[04](./evidence/T04_FOCUS_INPUT_04_20261016.json)、[05](./evidence/T04_FOCUS_INPUT_05_20261016.json)在 WeatherPoem 启动前就无法让临时输入框取得前台，属于测试前提失败，不计入产品成功或失败。检查当前锁定的 Tao 0.37.1 实现发现，窗口创建后会清除一次性 `MARKER_DONT_FOCUS`，随后显示路径可能调用 `SW_SHOW`；这提示自动展示仍需针对前台焦点做更强的稳定性验证，而不是凭配置中的 `focus:false` 推断绝不抢焦点。先前一次实际抢焦点记录依旧有效，A4 不提升为通过。

2026-10-17 核对[Tao 0.37.1 官方发布说明](https://github.com/tauri-apps/tao/releases/tag/tao-v0.37.1)后确认：初始 `focused(false)` 不再保证后续 `set_visible(true)` 继续不激活窗口。这是上游有意的行为变化，与本项目“隐藏初始化、稍后自动显示”路径冲突。再次用 `DB56…` 候选在 Codex 窗口前台运行[诊断报告](./evidence/T04_NATIVE_WINDOW_OFFSCREEN_DIAGNOSTIC_20261017.json)，确实再现自动显示抢焦点，且测试在托盘步骤前停止；此前 Explorer 前台的六次未抢焦点不能抵销该失败。

最小修正仅作用于自动显示：先暂时设窗口不可聚焦，显示后立即恢复可聚焦；用户主动打开仍显式取焦点。权限只增加 `core:window:allow-set-focusable`，未放开整个窗口默认能力。新隔离内部 EXE `.work/redesign-tauri-noactivate-experiment-20261017/release/weatherpoem.exe` 的 SHA-256 是 `0921010061A8D66C551DEAC609B74063433C88B07D836B321F4EAECAF401D4AD`，未替换旧候选或安装程序。Codex 前台的[逐次焦点样本 01](./evidence/T04_NOACTIVATE_FOCUS_ONLY_01_20261017.json)至 `08` 共 **8/8** 保持原前台 PID；临时输入框取得焦点的[样本 01](./evidence/T04_NOACTIVATE_INPUT_FOCUS_01_20261017.json)、[02](./evidence/T04_NOACTIVATE_INPUT_FOCUS_02_20261017.json)、[03](./evidence/T04_NOACTIVATE_INPUT_FOCUS_03_20261017.json)共 **3/3** 在显示后 1 秒仍保持输入框前台。随后[同哈希完整窗口报告](./evidence/T04_NOACTIVATE_FULL_WINDOW_20261017.json)完成自动不抢焦点、诗笺/阅读窗切换、精确托盘按钮程序化找回并取焦点、640×640 阅读尺寸跨重启保留；本次托盘按钮 `IsOffscreen=false`，没有使用“屏外调用”诊断后门。最小化雨景回归见 T07，隔离跨日和撤回见 T01/T08。以上仍是单机 Windows 11、100% 缩放与程序化托盘，不能证明真人点击、真实全屏、多 DPI 或长期焦点稳定；A4 保持**部分通过**。

同哈希的[原生可视复核报告](./evidence/T04_NOACTIVATE_VISUAL_WINDOW_20261017.json)再次通过窗口与托盘流程，并归档[诗笺画面](./evidence/T04_NOACTIVATE_VISUAL_WINDOW_20261017_glance.png)和[展开阅读画面](./evidence/T04_NOACTIVATE_VISUAL_WINDOW_20261017_reading.png)。逐张检查当前 100% 单屏画面：诗题、正文、理由、返回/收藏/展开入口可读，无明显文字裁切或装饰遮挡；这不代表横竖排、长词、200% 缩放或读屏的完整可视验收。

随后同哈希新增原生前台边界对照。脚本先用临时 WinForms 无边框窗口取得前台，再用全新隔离资料以 `--autostart` 启动 WeatherPoem。[仅覆盖工作区、保留任务栏](./evidence/T04_NOACTIVATE_WORKAREA_DPI_20261017.json)时，诗笺自动出现但测试窗仍在前台；[覆盖完整主显示器](./evidence/T04_NOACTIVATE_FULLSCREEN_DPI_20261017.json)时，诗笺保持隐藏、测试窗仍在前台。两份最终报告记录测试窗 DPI 为 96、预设边界成立，两种情形下主动启动第二实例，诗笺均显示并取得焦点。前两次[工作区](./evidence/T04_NOACTIVATE_WORKAREA_20261017.json)与[全屏](./evidence/T04_NOACTIVATE_FULLSCREEN_MATRIX_20261017.json)运行及最初单独的[全屏试验](./evidence/T04_NOACTIVATE_FULLSCREEN_20261017.json)同样通过，保留原始证据而未覆盖。脚本只关闭准确测试进程和临时资料，没有更改真实启动项、系统时间或显示设置。这验证的是本机 Windows 11、单屏 100% 下两种**合成边界**，不能代签真实 PowerPoint/游戏演示、任务栏自动隐藏、多屏混合 DPI 或真人托盘点击；A4 仍**部分通过**。
