# 安装 GenOffice

每个版本都发布在项目 GitHub 的 [Releases 页面](https://github.com/pblsketch/openoffice/releases/latest)上。除了 Windows 版，还以 Beta 形式发布 Mac 版和 Linux 版。Mac 版和 Linux 版开发者没有亲自测试，而是通过用户的反馈来确认。

## 选择适合你机器的文件

| 平台                                    | 需求                                   | 文件                              |
| --------------------------------------- | -------------------------------------- | --------------------------------- |
| **Windows**                             | Windows 10 或更高版本，64 位 Intel/AMD | `GenOffice-Setup-<version>.exe`   |
| **Mac（Beta）**，Apple 芯片             | macOS 12 或更高版本，M1 或更新的芯片   | `GenOffice-<version>-arm64.dmg`   |
| **Mac（Beta）**，Intel                  | macOS 12 或更高版本，Intel 处理器      | `GenOffice-<version>-x64.dmg`     |
| **Linux（Beta）**，任意发行版           | 64 位（x86_64）                        | `GenOffice-<version>.AppImage`    |
| **Linux（Beta）**，Ubuntu/Debian 系     | 64 位（x86_64）                        | `ieumoffice_<version>_amd64.deb`  |
| **Linux（Beta）**，Fedora/RHEL/openSUSE | 64 位（x86_64）                        | `ieumoffice-<version>.x86_64.rpm` |

想知道自己用的是哪种 Mac，请打开苹果菜单 ▸ **关于本机**。如果“芯片”显示 Apple M…，请下载以 `-arm64.dmg` 结尾的文件；如果“处理器”显示 Intel …，请下载以 `-x64.dmg` 结尾的文件。Releases 页面上的其他文件（`.zip`、`.yml`、`.blockmap`）是应用自身更新时使用的，你不需要下载。旧版本仍保留在 Releases 页面上。

## 在 Windows 上

1. 从 Releases 页面下载 `GenOffice-Setup-<version>.exe`。
2. 运行它。安装程序没有代码签名，所以 Windows 可能会先弹出一个蓝色的“Windows 已保护你的电脑”窗口。点**更多信息**，再点**仍要运行**。具体文字因 Windows 版本而异。
3. 按照安装程序的提示一直走到最后。

它会把 GenOffice 放进开始菜单，并注册 `.docx`、`.xlsx`、`.pptx`、`.pdf` 等格式，双击文件就会用 GenOffice 打开。

因为安装程序没有签名，请只运行从上面的 Releases 页面下载的文件。

## Windows 拦截下载或安装时

### Edge 提示文件“不常被下载”

Microsoft Defender SmartScreen 遇到很少有人下载过的文件时，会这样发出警告。Microsoft 给出的保留文件的方法如下：

1. 打开 Edge 的下载列表（**Ctrl+J**），点文件旁边的 **…**，选择**保留**。
2. 在打开的窗口中点**显示更多**，再点**仍然保留**。文件会留在你的“下载”文件夹中。

这个窗口里还有一个报告文件安全的按钮。它只会打开 Microsoft 的报告页面（`feedback.smartscreen.microsoft.com`），并不会保留文件。请关闭该页面，改为在窗口中点**显示更多**。

如果窗口中没有**显示更多**或**仍然保留**：

- 在学校或公司管理的电脑上，管理员可以禁止跳过这些警告（一项 Edge 策略）。这时这台电脑上谁都无法保留该文件；请让管理员替你安装或放行。
- 用另一个浏览器从 Releases 页面下载，得到的也是同一个文件。
- 如果这两种办法都不行，而且这是你自己的电脑，作为最后的办法，Microsoft 的下载疑难解答指南允许暂时关闭 Microsoft Defender SmartScreen：在 Edge 中打开 **设置及其他 (…) ▸ 设置 ▸ 隐私、搜索和服务 ▸ 安全性**，关闭 **Microsoft Defender SmartScreen**，重新下载文件，然后立即重新打开它。关闭期间，Edge 既不会对下载发出警告，也不会对钓鱼网页等危险网站发出警告。

### 出现“Windows 已保护你的电脑”窗口

Microsoft Defender SmartScreen 第一次遇到没有签名的安装程序时，会显示这个窗口。点**更多信息**，就会出现**仍要运行**按钮。在学校或公司管理的电脑上，管理员的设置可能会隐藏这个按钮；请联系管理员。

### 智能应用控制拦截

Windows 11 的智能应用控制开启时，会阻止没有签名的安装程序，也不提供**更多信息**这条路径。Microsoft 表示无法只放行某一个应用：唯一的办法是在 **Windows 安全中心 ▸ 应用和浏览器控制 ▸ 智能应用控制设置** 中关闭智能应用控制。这样一来，对其他所有应用的这项保护也会一并失效。安装了最新更新的 Windows 可以在不重装 Windows 的情况下重新打开它。

## 在 Mac 上（Beta）

需要 macOS 12（Monterey）或更高版本。Mac 版没有 Apple 开发者签名，所以第一次打开时，macOS 会提示无法验证该应用不含恶意软件，并且不会打开它。按下面的步骤允许一次即可。

1. 打开 dmg，把 `GenOffice.app` 拖进**应用程序**文件夹。
2. 从“应用程序”文件夹打开 GenOffice。出现警告时，点**完成**。
3. 打开**系统设置 ▸ 隐私与安全性**。在靠近底部、写着 GenOffice 已被阻止的那一行旁边，点**仍要打开**，并输入 Mac 的密码。这个按钮在你尝试打开应用后大约一小时内会显示。
4. 在再次出现的窗口中点**打开**。此后再打开就不会有警告了。

在 macOS 12 上，位置是**系统偏好设置 ▸ 安全性与隐私 ▸ 通用**，按钮同样是那里的**仍要打开**。

如果 macOS 提示该应用“已损坏，无法打开”，不要把它移到废纸篓。在“终端”里运行下面这一行，然后重新打开应用，并按上面的方法允许。它会去掉 macOS 给从互联网下载的文件附加的标记。

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

如果 macOS 提示这台 Mac 不支持该应用，请检查两件事：

- Intel Mac 无法运行 Apple 芯片版的文件（`-arm64.dmg`）。在**关于本机**中查看“处理器”，删除已安装的应用，改为安装 `-x64.dmg` 文件。
- macOS 11 或更早的版本无法运行 GenOffice。**关于本机**中也会显示 macOS 版本。

在 Mac 上还要注意：

- AI 连接卡片上没有安装按钮。请按卡片上的官方安装指南链接来安装 Claude Code 或 Codex。Claude 桌面应用不是 Claude Code，所以即使装了桌面应用，也需要另外安装 Claude Code。
- 登录会在浏览器中完成。如果浏览器要求你粘贴代码，请自己在“终端”中运行 `claude auth login` 或 `codex login`。见[订阅连接](help://subscription)。

## 在 Linux 上（Beta）

- **AppImage**：给它加上可执行权限（`chmod +x GenOffice-<version>.AppImage`），然后运行该文件。没有安装步骤。
- **deb**：用 `sudo apt install ./ieumoffice_<version>_amd64.deb` 安装。
- **rpm**：用 `sudo dnf install ./ieumoffice-<version>.x86_64.rpm` 安装。在 openSUSE 上，用 `sudo zypper install ./ieumoffice-<version>.x86_64.rpm` 安装。

deb 和 rpm 会安装到 `/opt/GenOffice`，并链接终端命令 `/usr/bin/ieumoffice`。与 Mac 一样，AI 连接卡片上没有安装按钮；登录要求输入代码时，请自己在终端中运行 `claude auth login` 或 `codex login`。

## 更新

- GenOffice 在同一个 GitHub Releases 页面上查找新版本。有新版本发布时，**设置 ▸ 关于**会给出更新：点**更新到 …**，等下载完成，再点**重启并安装**。在 Windows 上会显示安装进度窗口，安装完成后 GenOffice 会重新打开，并恢复之前打开的文档。在 Mac 上，应用会关闭、替换为新版本，然后重新打开并恢复之前打开的文档。这只适用于放在“应用程序”文件夹中的应用；直接从磁盘映像打开的应用会改为提示下载页面。只有按下该按钮时才会安装更新，直接关闭应用不会安装。
- 在 Linux 上，只有 AppImage 会自动更新。使用 deb 或 rpm 安装时，应用会告诉你有新版本并打开下载页面；请用同样的方法安装新文件。
- **菜单（☰） ▸ 检查更新**会在你需要的时候立即检查。在 Mac 上是**帮助 ▸ 检查更新**。
- 检查失败时——没有网络，或者还没有发布任何版本——什么都不会发生，应用照常使用。
- **更新通道**也在 设置 ▸ 关于 里，分为稳定版和 Beta 版。改完立即生效并检查更新；它不会把 Beta 版安装退回稳定版。
- 更新包同样没有代码签名。安装之前，应用会把下载的文件与随该版本一同发布的校验和进行比对。
- 如果点了**重启并安装**后应用关闭了，却没有装上新版本，下次启动时会告诉你，并再次提供更新。这一次安装程序会以窗口方式打开，你可以看到进度，并回应管理员授权提示。如果仍然不行，更新窗口会指向下载页面；用那里下载的安装文件安装，设置和文档都会保留。更新的过程记录在应用数据文件夹的 `update-log.txt` 中（在文件资源管理器地址栏输入 `%APPDATA%\GenOffice` 即可打开）。报告问题时请附上这个文件。

## 你正在运行的构建

**设置 ▸ 关于** 是应用报告你所用的版本、它跟随的更新通道以及项目所在地的地方。这里还写明了本应用所基于的开源项目。

## 命令行随包附带

每个安装版本都带一个 `ieumoffice` 命令，它和窗口调用的是同一套引擎，因此两者对同一个文件不会给出不同的结果。`ieumoffice install-cli` 会把它放进你的 `PATH`。它能做什么，见[命令行与智能体](help://cli)。
