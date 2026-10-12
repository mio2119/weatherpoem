# Windows 人工发布证据执行手册

更新时间：2026-07-24

## 1. 目的与边界

本手册补齐三项不能由普通构建机冒充的证据：

1. 当前 MSI 在管理员权限下真实完成安装、修复和卸载；
2. 用户从应用设置启用和禁用开机启动后，各经历一次真实 Windows 重启；
3. 从真实低版本 NSIS 安装到当前版本，再恢复低版本并卸载，期间用户数据保持可用。

脚本只接受与 `E:\weatherpoem` 当前版本和二进制哈希一致的结果。它们不会自动
重启 Windows，也不会替用户修改开机启动设置。跨重启脚本只观察注册项、进程、
启动参数和系统启动时间；开关必须由测试人通过 WeatherPoem 设置页操作。

`D:\纯净工作台` 仍只用于隔离编排和复验，不存放源码。真实设备脚本必须从
`E:\weatherpoem` 执行，才能与当前发布物绑定。

## 2. 管理员 MSI 生命周期

### 前置条件

- 使用专用测试机或获批准的测试窗口；
- 系统中没有 WeatherPoem 安装、进程、自启项或快捷方式；
- 当前 MSI、便携 EXE、SHA-256 清单和发布清单已经生成；
- 从“以管理员身份运行”的 PowerShell 执行；
- 了解脚本会真实安装、启动六秒、修复并卸载当前 `perMachine` MSI。

脚本发现既有 WeatherPoem 状态时会停止，不会覆盖。它不会删除
`%APPDATA%\cn.weatherpoem.desktop` 或
`%LOCALAPPDATA%\cn.weatherpoem.desktop`；若这些目录原本存在，卸载后必须仍然
存在。测试程序本身可能按正常应用行为读取或更新其中的数据，因此正式执行仍应
使用专用 Windows 测试账户。

### 执行

先在普通 PowerShell 做只读预检。该命令不会安装、修复、卸载或创建证据目录：

```powershell
cd E:\weatherpoem
npm run release:test:msi-elevated -- -Preflight
```

输出中的 `stateChanged` 必须为 `false`。在非管理员窗口中
`readyForApprovedRun` 会保持 `false`，这是预期结果。

随后打开获批准的管理员 PowerShell：

```powershell
cd E:\weatherpoem
npm run release:test:msi-elevated -- -ConfirmLifecycle
```

脚本依次验证：

- 当前会话确实已提升为管理员；
- MSI 注册为当前版本的 `perMachine` 安装；
- 注册表中只有一个有效产品代码和一个已安装主程序；
- 已安装程序与当前 Release EXE 的 SHA-256 和签名状态一致；
- 程序以 `--autostart` 参数运行至少六秒；
- Windows Installer 修复后程序路径和哈希不变；
- 静默卸载后安装目录、卸载注册项、快捷方式、自启项和进程均无残留；
- 预先存在的应用数据目录没有被删除。

通过后生成：

- `output/WeatherPoem_<版本>_MSI_ELEVATED_LIFECYCLE.json`
- `output/windows-manual-evidence/msi-<运行标识>-install.log`
- `output/windows-manual-evidence/msi-<运行标识>-repair.log`
- `output/windows-manual-evidence/msi-<运行标识>-uninstall.log`

若中途失败，脚本会在已获得产品代码时尝试调用 Windows Installer 清理，但不会
直接递归删除安装目录。失败时不会生成“通过”报告；应先检查警告、安装注册项和
三份日志，再决定是否重试。

## 3. 真实开机自启启停

这项验证需要两次真实“重启”，不能使用关机后快速启动，也不能只结束和重开
Explorer。全部四个阶段必须由同一个 Windows 用户、同一台机器、同一份已安装
程序完成。

### 准备

1. 安装与当前 Release EXE 哈希一致的 WeatherPoem 0.2.0；
2. 完成首次设置；
3. 在设置页启用“开机启动”并保存；
4. 从托盘菜单退出 WeatherPoem；
5. 确认这段测试期间不会手动打开或关闭应用，除非步骤明确要求。

### 阶段 A：记录已启用状态

```powershell
cd E:\weatherpoem
npm run release:test:autostart-reboot -- -Mode PrepareEnable
```

该命令要求恰好一个自启注册项，其目标是已安装程序并包含
`--autostart`，同时要求应用进程已经退出。它只写入待续状态文件，不重启系统。

正常重启 Windows。登录后不要手动打开或关闭 WeatherPoem，运行：

```powershell
cd E:\weatherpoem
npm run release:test:autostart-reboot -- -Mode VerifyEnable
```

该阶段要求系统启动时间晚于准备阶段，并证明同一路径的 WeatherPoem 进程在本次
启动后以 `--autostart` 参数启动。

### 阶段 B：记录已禁用状态

1. 打开 WeatherPoem 设置；
2. 禁用“开机启动”并保存；
3. 从托盘菜单退出应用；
4. 运行：

```powershell
cd E:\weatherpoem
npm run release:test:autostart-reboot -- -Mode PrepareDisable
```

正常重启 Windows。登录后不要手动打开 WeatherPoem，运行：

```powershell
cd E:\weatherpoem
npm run release:test:autostart-reboot -- -Mode VerifyDisable
```

最后阶段默认持续观察十秒，要求自启注册项和 WeatherPoem 进程都保持不存在。
通过后生成：

- `output/WeatherPoem_<版本>_AUTOSTART_REBOOT_STATE.json`
- `output/WeatherPoem_<版本>_AUTOSTART_REBOOT.json`

`STATE.json` 仅用于同机跨重启续跑，包含本机安装路径和注册值，已排除在版本控制
之外，不应作为评审附件分享。最终 `AUTOSTART_REBOOT.json` 不保存明文机器名、
用户 SID、安装路径、注册值或命令行，只保留用于证明同机同用户和同一路径的
SHA-256 绑定值。

可随时查看或中止待续流程：

```powershell
npm run release:test:autostart-reboot -- -Mode Status
npm run release:test:autostart-reboot -- -Mode Abort
```

`Abort` 只把状态标记为中止，不删除文件、不修改注册表、不结束进程，也不恢复或
改变应用设置。

## 4. NSIS 基线升级与手动回滚

这项测试使用仓库中已保留并有 SHA-256 清单的 `0.1.0` NSIS 作为基线，验证
`0.1.0 → 0.2.0 → 0.1.0 → 卸载`。它不是自动更新测试，也不验证 MSI 升级；
“回滚”指发生问题后重新安装上一版 NSIS 的人工恢复路径。

### 强制安全前提

- 必须使用没有真实 WeatherPoem 数据的专用 Windows 测试账号；
- 系统中不能有 WeatherPoem 安装、运行进程、自启项或快捷方式；
- `%APPDATA%\cn.weatherpoem.desktop` 和
  `%LOCALAPPDATA%\cn.weatherpoem.desktop` 必须都不存在；
- 不得为了通过测试而删除、移动、改名或备份覆盖现有用户数据；
- 基线与当前 NSIS、基线 SHA-256 清单和当前发布清单必须来自
  `E:\weatherpoem`。

先在普通 PowerShell 执行只读预检：

```powershell
cd E:\weatherpoem
npm run release:test:nsis-upgrade -- -Preflight
```

预检不会安装、卸载、启动程序、建立临时测试目录或生成通过报告。输出中的
`stateChanged` 必须为 `false`，只有 `readyForDedicatedAccountRun` 为 `true`
才允许继续。2026-07-24 的当前开发账号检测到两处既有应用数据根目录，因此
预期结果为 `false`；这证明保护边界生效，不是需要绕过的错误。

在满足全部前提的专用账号执行：

```powershell
cd E:\weatherpoem
npm run release:test:nsis-upgrade -- -ConfirmLifecycle
```

脚本会依次：

1. 将 `0.1.0` 安装到唯一测试目录，并在全新应用数据目录写入受控标记；
2. 启动基线版本，随后用 `0.2.0` 覆盖升级并核对当前 EXE 哈希；
3. 再安装 `0.1.0` 作为人工回滚，确认基线载荷恢复；
4. 每个版本均完成启动观察，并确认受控数据标记未丢失；
5. 卸载后检查安装、进程、注册项、快捷方式和自启项零残留；
6. 只清理本次测试创建且路径精确匹配的两处应用数据目录。

通过后生成：

- `output/WeatherPoem_0.2.0_NSIS_UPGRADE_ROLLBACK.json`

独立复核：

```powershell
npm run release:verify:upgrade
```

该报告只证明 NSIS 基线升级、人工回滚和数据保留。Tauri updater、MSI 升级、
远程撤回有问题的内容，以及自动更新失败恢复仍需分别设计和验证。

## 5. 证据门禁

两份人工报告均生成后执行：

```powershell
cd E:\weatherpoem
npm run release:verify:manual-windows
```

该门禁会重新读取当前发布物，拒绝旧版本、旧哈希、错误签名状态、伪造重启时序、
缺失 `--autostart` 参数、MSI 修复遗漏、卸载残留或保护边界不完整的报告。

`npm run release:verify` 只验证当前 M1 试用包的自动化证据，不要求人工报告。
`npm run release:verify:manual-windows` 只复核管理员 MSI 与重启自启两份报告，
`npm run release:verify:upgrade` 只复核升级回滚报告。
`npm run release:verify:production` 会同时强制要求三份报告；即使报告齐全，
代码签名、时间戳、HTTPS 发布地址、全部设备矩阵、真实内容复核、内容撤回和其他
生产条件仍须分别完成。

## 6. 与设备矩阵的关系

这三份报告只能证明执行它们的那台机器和那个 Windows 用户。测试人仍需把可访问
的报告路径、执行人和执行时间填入 `review/device-matrix-plan.json` 对应场景。
Windows 10/11、125%/150%/200%、混合 DPI、多显示器、专注模式、演示全屏和
其他设备上的版本升级不能由单机报告自动替代。
