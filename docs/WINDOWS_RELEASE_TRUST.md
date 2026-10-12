# Windows 发布可信门禁

更新时间：2026-07-24

## 1. 当前结论

WeatherPoem 0.2.0 当前属于 `trial` 渠道。便携 EXE、NSIS 安装包和
MSI 安装包均未进行 Authenticode 代码签名，只能用于受控的内部试用，
不能作为正式公开发行版对外宣传或分发。

应用的“设置 → 版本与信任”会显示：

- 版本号；
- `M1 未签名试用版`；
- “仅用于受控的内部试用，不是正式公开发行版”的说明。

这不是用提示文字代替安全能力。项目同时对实际二进制执行 Authenticode
检查，试用渠道必须明确检测为 `NotSigned`；若出现未知或失效签名，试用门禁
也会失败。

## 2. 发布物与机器可验证证据

每次 Windows 构建必须同时交付：

- `src-tauri/target/release/weatherpoem.exe`
- `src-tauri/target/release/bundle/nsis/WeatherPoem_<版本>_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/WeatherPoem_<版本>_x64_en-US.msi`
- `output/WeatherPoem_<版本>_SHA256.txt`
- `output/WeatherPoem_<版本>_RELEASE.json`

`RELEASE.json` 记录每个发布物的文件名、字节数、SHA-256、下载地址和
Authenticode 证书/时间戳状态。它是可复核的发布元数据，不等同于 Tauri
自动更新签名，也不表示当前已经接入自动更新。

本地试用版的构建后命令：

```powershell
cd E:\weatherpoem
npm run tauri:build
npm run release:checksums
npm run release:manifest
npm run release:test:nsis
npm run release:test:msi-image
npm run release:test:single-instance
npm run release:test:window-position
npm run release:verify
```

`release:test:nsis` 会在确认系统没有既有 WeatherPoem 安装、自启项、快捷方式
或运行进程后，安装到唯一临时目录，执行六秒启动、静默卸载和残留检查。
`release:test:msi-image` 使用不注册系统安装的 administrative image 模式解包
MSI，校验载荷启动和临时目录清理；它不会冒充需要管理员权限的真实
per-machine 安装、修复和卸载测试。
`release:test:single-instance` 验证主窗口关闭后隐藏到托盘、第二进程退出、
仍只有一个主进程，以及第二次启动能重新显示原窗口。
`release:test:window-position` 使用 Windows 实际工作区和窗口 DPI 验证右下角
边距、窗口不越界以及关闭请求只隐藏窗口。
最后一个命令会复算并交叉检查版本、尺寸、SHA-256、Authenticode 状态、
发布清单，以及 NSIS/MSI 证据是否分别绑定当前安装包哈希。

管理员 MSI 安装/修复/卸载和开机自启启用/禁用需要真实权限与两次系统重启，
不能放进普通构建命令。完整步骤见 `docs/WINDOWS_MANUAL_EVIDENCE.md`。执行后用
`npm run release:verify:manual-windows` 复核两份报告与当前发布物是否一致。
低版本 NSIS 升级和人工回滚同样使用专用账号单独执行，并用
`npm run release:verify:upgrade` 复核；当前开发账号已有真实应用数据，安全预检
会拒绝在该账号运行生命周期测试。

## 3. 正式发布门禁

`production` 渠道必须同时满足：

1. `package.json`、`src-tauri/tauri.conf.json` 和
   `src-tauri/Cargo.toml` 的版本完全一致；
2. 三个发布物的 Authenticode 状态均为 `Valid`；
3. 三个发布物均具有可信时间戳；
4. 签名证书指纹属于项目方在发布环境显式允许的列表；
5. 每个发布物都有 HTTPS 下载地址；
6. SHA-256 清单、发布清单和实际文件完全一致；
7. 应用内显示“正式签名版”，不能沿用试用版标识；
8. 当前 MSI 已在获批管理员环境完成真实安装、修复、卸载和残留检查；
9. 当前已安装程序已完成开机启动启用和禁用各一次真实 Windows 重启；
10. 已从有哈希清单的真实低版本完成 NSIS 升级、人工回滚、数据保留和卸载检查。

门禁不会自动获取证书，也不会将私钥写入仓库。证书采购、组织身份验证、
硬件密钥或云签名权限必须由项目责任主体完成。

## 4. 正式签名操作顺序

1. 从可信代码签名服务商获得 Windows 代码签名能力，并由组织安全负责人
   确认证书主体和证书指纹。
2. 按服务商方案配置 Tauri 的 `bundle.windows` 签名：
   - Windows 证书存储方案可使用 `certificateThumbprint`、
     `digestAlgorithm: "sha256"` 和 `timestampUrl`；
   - 云签名、硬件密钥或自定义签名工具使用 `signCommand`；
   - 私钥、口令和云凭据只放在受控发布环境的机密管理中。
3. 将 `package.json` 的 `weatherPoem.releaseChannel` 改为
   `production`，使正式状态进入同一份前端构建。
4. 在干净的 Windows 发布机运行 `npm ci`、`npm run check` 和
   `npm run tauri:build`。Tauri 构建过程必须对主程序和最终安装包执行签名。
5. 用 Windows `Get-AuthenticodeSignature` 或 `signtool verify`
   独立确认三个发布物的签名和时间戳。
6. 生成新的哈希和发布清单：

```powershell
$env:WEATHERPOEM_ALLOWED_SIGNER_THUMBPRINTS = "<经审批的证书指纹>"
$env:WEATHERPOEM_RELEASE_BASE_URL = "https://download.example/release/0.2.0/"
npm run release:checksums
npm run release:manifest
npm run release:test:nsis
npm run release:test:msi-image
npm run release:test:single-instance
npm run release:test:window-position
npm run release:verify:manual-windows
npm run release:verify:upgrade
npm run release:verify:production
```

其中三份人工报告必须先按 `docs/WINDOWS_MANUAL_EVIDENCE.md` 生成。上面的两个
人工证据复核命令不会代替管理员操作、系统重启或升级生命周期；生产门禁会再次
校验这些报告与最终签名发布物的版本、哈希和签名状态。

7. 只有 `release:verify:production` 成功后，才可上传与清单完全相同的文件。
   上传后应从公开 HTTPS 地址重新下载并再次比对 SHA-256。

正式发布环境可用逗号配置多个处于轮换期的允许证书指纹，但每个值必须是
40 至 128 位十六进制指纹且不能重复。

## 5. 自动更新的边界

当前 0.2.0 没有启用自动更新。接入前必须另行完成：

- 选定稳定的 HTTPS 更新端点和回滚责任人；
- 安装并配置 Tauri updater 插件；
- 生成独立的 updater 公私钥，将公钥固化到客户端；
- 私钥只保存在发布机密系统，建立备份、轮换和吊销方案；
- 开启 updater artifacts，发布对应 `.sig`；
- 验证升级、断网、下载损坏、签名不匹配、降级和回滚场景；
- 更新隐私说明与网络访问白名单。

Tauri updater 的包签名与 Windows Authenticode 解决的是两个不同问题：
前者验证更新包确实由项目方发布，后者验证 Windows 可执行文件的发布者身份。
正式自动更新必须同时具备，不能互相替代。

## 6. 参考依据

- [Tauri Windows Code Signing](https://v2.tauri.app/distribute/sign/windows/)
- [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri Updater](https://v2.tauri.app/plugin/updater/)

以正式发布当日的官方文档和证书服务商要求为准。
