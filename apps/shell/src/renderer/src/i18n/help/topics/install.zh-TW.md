# 安裝 GenOffice

每個版本都發布在專案 GitHub 的 [Releases 頁面](https://github.com/pblsketch/openoffice/releases/latest)上。除了 Windows 版，也以 Beta 形式發布 Mac 版和 Linux 版。Mac 版和 Linux 版開發者沒有親自測試，而是透過使用者的回報來確認。

## 選擇適合你電腦的檔案

| 平台                                    | 需求                                     | 檔案                              |
| --------------------------------------- | ---------------------------------------- | --------------------------------- |
| **Windows**                             | Windows 10 或更新版本，64 位元 Intel/AMD | `GenOffice-Setup-<version>.exe`   |
| **Mac（Beta）**，Apple 晶片             | macOS 12 或更新版本，M1 或更新的晶片     | `GenOffice-<version>-arm64.dmg`   |
| **Mac（Beta）**，Intel                  | macOS 12 或更新版本，Intel 處理器        | `GenOffice-<version>-x64.dmg`     |
| **Linux（Beta）**，任何發行版           | 64 位元（x86_64）                        | `GenOffice-<version>.AppImage`    |
| **Linux（Beta）**，Ubuntu/Debian 系列   | 64 位元（x86_64）                        | `ieumoffice_<version>_amd64.deb`  |
| **Linux（Beta）**，Fedora/RHEL/openSUSE | 64 位元（x86_64）                        | `ieumoffice-<version>.x86_64.rpm` |

想知道自己用的是哪一種 Mac，請開啟蘋果選單 ▸ **關於這台 Mac**。如果「晶片」顯示 Apple M…，請下載以 `-arm64.dmg` 結尾的檔案；如果「處理器」顯示 Intel …，請下載以 `-x64.dmg` 結尾的檔案。Releases 頁面上的其他檔案（`.zip`、`.yml`、`.blockmap`）是應用程式自己更新時使用的，你不需要下載。舊版本仍保留在 Releases 頁面上。

## 在 Windows 上

1. 從 Releases 頁面下載 `GenOffice-Setup-<version>.exe`。
2. 執行它。安裝程式沒有程式碼簽章，所以 Windows 可能會先跳出一個藍色的「Windows 已保護您的電腦」視窗。請選擇**其他資訊**，再選擇**仍要執行**。實際的文字會因 Windows 版本而異。
3. 依照安裝程式的指示完成安裝。

它會把 GenOffice 放進開始功能表，並註冊 `.docx`、`.xlsx`、`.pptx`、`.pdf` 等格式，按兩下檔案就會用 GenOffice 開啟。

由於安裝程式沒有簽章，請只執行從上面的 Releases 頁面下載的檔案。

## Windows 擋下下載或安裝時

### Edge 提示檔案「不常被下載」

Microsoft Defender SmartScreen 遇到很少人下載過的檔案時，會這樣發出警告。Microsoft 提供的保留檔案方法如下：

1. 開啟 Edge 的下載清單（**Ctrl+J**），按檔案旁邊的 **…**，選擇**保留**。
2. 在開啟的視窗中按**顯示更多**，再按**仍然保留**。檔案會留在你的「下載」資料夾中。

這個視窗裡還有一個回報檔案安全的按鈕。它只會開啟 Microsoft 的回報頁面（`feedback.smartscreen.microsoft.com`），並不會保留檔案。請關閉該頁面，改為在視窗中按**顯示更多**。

如果視窗中沒有**顯示更多**或**仍然保留**：

- 在學校或公司管理的電腦上，系統管理員可以禁止略過這些警告（一項 Edge 原則）。這時這台電腦上誰都無法保留該檔案；請找系統管理員代為安裝或放行。
- 用另一個瀏覽器從 Releases 頁面下載，得到的也是同一個檔案。
- 如果這兩種方法都不行，而且這是你自己的電腦，作為最後的手段，Microsoft 的下載疑難排解指南允許暫時關閉 Microsoft Defender SmartScreen：在 Edge 中開啟 **設定及其他 (…) ▸ 設定 ▸ 隱私權、搜尋與服務 ▸ 安全性**，關閉 **Microsoft Defender SmartScreen**，重新下載檔案，然後立刻重新開啟它。關閉期間，Edge 既不會對下載發出警告，也不會對網路釣魚網頁等危險網站發出警告。

### 出現「Windows 已保護您的電腦」視窗

Microsoft Defender SmartScreen 第一次遇到沒有簽章的安裝程式時，會顯示這個視窗。按**其他資訊**，就會出現**仍要執行**按鈕。在學校或公司管理的電腦上，系統管理員的設定可能會隱藏這個按鈕；請洽詢系統管理員。

### 智慧型應用程式控制擋下

Windows 11 的智慧型應用程式控制開啟時，會阻止沒有簽章的安裝程式，也不提供**其他資訊**這條路徑。Microsoft 表示無法只放行某一個應用程式：唯一的辦法是在 **Windows 安全性 ▸ 應用程式與瀏覽器控制 ▸ 智慧型應用程式控制設定** 中關閉智慧型應用程式控制。這樣一來，對其他所有應用程式的這項保護也會一併失效。安裝了最新更新的 Windows 可以在不重新安裝 Windows 的情況下重新開啟它。

## 在 Mac 上（Beta）

需要 macOS 12（Monterey）或更新版本。Mac 版沒有 Apple 開發者簽章，所以第一次開啟時，macOS 會提示無法驗證該 App 不含惡意軟體，並且不會打開它。照下面的步驟允許一次即可。

1. 打開 dmg，把 `GenOffice.app` 拖進**應用程式**資料夾。
2. 從「應用程式」資料夾打開 GenOffice。出現警告時，按**完成**。
3. 打開**系統設定 ▸ 隱私權與安全性**。在靠近底部、寫著 GenOffice 已被阻擋的那一行旁邊，按**強制打開**，並輸入 Mac 的密碼。這個按鈕在你嘗試打開 App 後大約一小時內會顯示。
4. 在再次出現的視窗中按**打開**。此後再打開就不會有警告了。

在 macOS 12 上，位置是**系統偏好設定 ▸ 安全性與隱私權 ▸ 一般**，按鈕同樣是那裡的**強制打開**。

如果 macOS 提示該 App「已損毀，無法打開」，請不要把它移到垃圾桶。在「終端機」裡執行下面這一行，然後重新打開 App，並照上面的方法允許。它會去掉 macOS 為從網際網路下載的檔案加上的標記。

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

如果 macOS 提示這台 Mac 不支援該 App，請檢查兩件事：

- Intel Mac 無法執行 Apple 晶片版的檔案（`-arm64.dmg`）。在**關於這台 Mac**中查看「處理器」，刪除已安裝的 App，改為安裝 `-x64.dmg` 檔案。
- macOS 11 或更早的版本無法執行 GenOffice。**關於這台 Mac**中也會顯示 macOS 版本。

在 Mac 上還要注意：

- AI 連線卡片上沒有安裝按鈕。請依照卡片上的官方安裝指南連結來安裝 Claude Code 或 Codex。Claude 桌面應用程式不是 Claude Code，所以即使裝了桌面應用程式，也需要另外安裝 Claude Code。
- 登入會在瀏覽器中完成。如果瀏覽器要求你貼上代碼，請自己在「終端機」中執行 `claude auth login` 或 `codex login`。請見[訂閱連線](help://subscription)。

## 在 Linux 上（Beta）

- **AppImage**：給它加上可執行權限（`chmod +x GenOffice-<version>.AppImage`），然後執行該檔案。沒有安裝步驟。
- **deb**：用 `sudo apt install ./ieumoffice_<version>_amd64.deb` 安裝。
- **rpm**：用 `sudo dnf install ./ieumoffice-<version>.x86_64.rpm` 安裝。在 openSUSE 上，請用 `sudo zypper install ./ieumoffice-<version>.x86_64.rpm` 安裝。

deb 和 rpm 會安裝到 `/opt/GenOffice`，並連結終端機指令 `/usr/bin/ieumoffice`。與 Mac 一樣，AI 連線卡片上沒有安裝按鈕；登入要求輸入代碼時，請自己在終端機中執行 `claude auth login` 或 `codex login`。

## 更新

- GenOffice 會在同一個 GitHub Releases 頁面上尋找新版本。有新版本發布時，**設定 ▸ 關於**會提供更新：按**更新到 …**，等下載完成，再按**重新啟動並安裝**。在 Windows 上會顯示安裝進度視窗，安裝完成後 GenOffice 會重新開啟，並恢復先前開啟的文件。在 Mac 上，App 會關閉、換成新版本，然後重新開啟並恢復先前開啟的文件。這只適用於放在「應用程式」資料夾中的 App；直接從磁碟映像檔開啟的 App 會改為提示下載頁面。只有按下該按鈕時才會安裝更新，直接關閉應用程式不會安裝。
- 在 Linux 上，只有 AppImage 會自動更新。以 deb 或 rpm 安裝時，應用程式會告訴你有新版本並開啟下載頁面；請用同樣的方法安裝新檔案。
- **選單（☰） ▸ 檢查更新**會在你需要的時候立刻檢查。在 Mac 上是**說明 ▸ 檢查更新**。
- 檢查失敗時——沒有網路，或是還沒有發布任何版本——什麼事都不會發生，應用程式照常使用。
- **更新通道**同樣在 設定 ▸ 關於 裡，分為穩定版和 Beta 版。變更後立即生效並檢查更新；它不會把 Beta 版的安裝降回穩定版。
- 更新檔同樣沒有程式碼簽章。安裝之前，應用程式會拿下載的檔案和隨該版本一起發布的校驗和比對。
- 如果按了**重新啟動並安裝**後應用程式關閉了，卻沒有裝上新版本，下次啟動時會告訴你，並再次提供更新。這一次安裝程式會以視窗方式開啟，你可以看到進度，並回應系統管理員授權提示。如果仍然不行，更新視窗會指向下載頁面；用那裡下載的安裝檔安裝，設定和文件都會保留。更新的過程記錄在應用程式資料夾的 `update-log.txt` 中（在檔案總管網址列輸入 `%APPDATA%\GenOffice` 即可開啟）。回報問題時請附上這個檔案。

## 你正在執行的建置

**設定 ▸ 關於** 是應用程式回報你目前的版本、它跟隨的更新通道，以及專案所在位置的地方。這裡也會寫明本應用程式所根據的開放原始碼專案。

## 命令列隨著一起安裝

每次安裝都會附帶一個 `ieumoffice` 命令，它與視窗呼叫的是同一套引擎，因此兩者對同一個檔案不會有分歧。`ieumoffice install-cli` 會把它放進你的 `PATH`。它能做什麼，請見[命令列與智慧代理](help://cli)。
