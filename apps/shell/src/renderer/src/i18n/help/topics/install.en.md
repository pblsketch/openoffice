# Installing GenOffice

Every version is published on the [Releases page](https://github.com/pblsketch/openoffice/releases/latest) of the project on GitHub. The Windows build is published together with Mac and Linux builds released as betas. The developer cannot test the Mac and Linux builds directly; they are confirmed through users' reports.

## Pick the file for your machine

| Platform                               | Requirements                          | File                              |
| -------------------------------------- | ------------------------------------- | --------------------------------- |
| **Windows**                            | Windows 10 or later, 64-bit Intel/AMD | `GenOffice-Setup-<version>.exe`   |
| **Mac (beta)**, Apple Silicon          | macOS 12 or later, M1 or newer chip   | `GenOffice-<version>-arm64.dmg`   |
| **Mac (beta)**, Intel                  | macOS 12 or later, Intel processor    | `GenOffice-<version>-x64.dmg`     |
| **Linux (beta)**, any distribution     | 64-bit (x86_64)                       | `GenOffice-<version>.AppImage`    |
| **Linux (beta)**, Ubuntu/Debian family | 64-bit (x86_64)                       | `ieumoffice_<version>_amd64.deb`  |
| **Linux (beta)**, Fedora/RHEL/openSUSE | 64-bit (x86_64)                       | `ieumoffice-<version>.x86_64.rpm` |

To see which Mac you have, open the Apple menu ▸ **About This Mac**. If "Chip" says Apple M…, take the file ending in `-arm64.dmg`; if "Processor" says Intel …, take the one ending in `-x64.dmg`. The other files on the Releases page (`.zip`, `.yml`, `.blockmap`) are what the app itself uses to update; you do not need to download them. Older versions stay on the Releases page.

## On Windows

1. Download `GenOffice-Setup-<version>.exe` from the Releases page.
2. Run it. The installer is not code-signed, so Windows may first show a blue "Windows protected your PC" window. Choose **More info**, then **Run anyway**. The exact wording depends on your Windows version.
3. Follow the installer to the end.

It puts GenOffice in the Start menu and registers `.docx`, `.xlsx`, `.pptx`, `.pdf` and friends so double-clicking a file opens it.

Because the installer is not signed, only run one you downloaded from the Releases page above.

## When Windows blocks the download or the install

### Edge says the file "isn't commonly downloaded"

Microsoft Defender SmartScreen warns this way about a file it has not seen many people download. Microsoft's guide to keep the file is:

1. Open Edge's download list (**Ctrl+J**), press **…** next to the file and choose **Keep**.
2. In the window that opens, press **Show more**, then **Keep anyway**. The file stays in your Downloads folder.

That window also has a button that reports the file as safe. It only opens Microsoft's report page (`feedback.smartscreen.microsoft.com`) and does not keep the file. Close that page and press **Show more** in the window instead.

If the window has no **Show more** or no **Keep anyway**:

- On a PC that a school or company manages, the administrator can switch off skipping these warnings (an Edge policy). Then nobody on that PC can keep the file; ask the administrator to install it or to allow it.
- Downloading from the Releases page in a different browser gives you the same file.
- If neither helps and it is your own PC, Microsoft's download troubleshooting guide allows turning Microsoft Defender SmartScreen off for a moment, as a last resort. In Edge open **Settings and more (…) ▸ Settings ▸ Privacy, search, and services ▸ Security**, turn **Microsoft Defender SmartScreen** off, download the file again, then turn it back on straight away. While it is off, Edge warns you neither about downloads nor about dangerous sites such as phishing pages.

### A "Windows protected your PC" window appears

Microsoft Defender SmartScreen shows this window the first time it sees an unsigned installer. Press **More info** and a **Run anyway** button appears. On a PC that a school or company manages, an administrator setting can hide that button; ask the administrator.

### Smart App Control blocks it

When Windows 11's Smart App Control is on, it stops unsigned installers and offers no **More info** path. Microsoft says there is no way to allow a single app: the only option is to turn Smart App Control off, under **Windows Security ▸ App & browser control ▸ Smart App Control settings**. That removes this protection for every other app too. With recent Windows updates it can be turned back on without reinstalling Windows.

## On a Mac (beta)

You need macOS 12 (Monterey) or later. The Mac build has no Apple developer signature, so the first time you open it macOS says it cannot verify the app is free of malware and does not open it. Allow it once, as below.

1. Open the dmg and drag `GenOffice.app` into the **Applications** folder.
2. Open GenOffice from the Applications folder. When the warning appears, press **Done**.
3. Open **System Settings ▸ Privacy & Security**. Near the bottom, next to the line saying GenOffice was blocked, press **Open Anyway** and enter your Mac password. The button shows for about an hour after you tried to open the app.
4. In the window that appears again, press **Open**. From then on it opens without a warning.

On macOS 12 the place is **System Preferences ▸ Security & Privacy ▸ General**, and the button is **Open Anyway** there.

If macOS says the app "is damaged and can't be opened", do not move it to the Trash. Run the line below in Terminal, then open the app again and allow it as above. It removes the mark macOS attaches to files downloaded from the internet.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

If macOS says the app is not supported on this Mac, check two things:

- An Intel Mac cannot run the Apple Silicon file (`-arm64.dmg`). Check "Processor" under **About This Mac**, delete the app you installed, and install the `-x64.dmg` file instead.
- macOS 11 or earlier cannot run GenOffice. **About This Mac** also shows the macOS version.

Also on a Mac:

- The AI connection cards have no install button. Follow the card's official install guide link to install Claude Code or Codex. The Claude desktop app is not Claude Code, so Claude Code has to be installed even when the desktop app is.
- Signing in finishes in the browser. If the browser asks you to paste a code, run `claude auth login` or `codex login` in Terminal yourself. See [Subscription connection](help://subscription).

## On Linux (beta)

- **AppImage**: make it executable (`chmod +x GenOffice-<version>.AppImage`) and run the file. There is no install step.
- **deb**: install with `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm**: install with `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. On openSUSE, use `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

The deb and rpm packages install to `/opt/GenOffice` and link the terminal command `/usr/bin/ieumoffice`. As on a Mac, the AI connection cards have no install button, and when a sign-in asks for a code you run `claude auth login` or `codex login` in a terminal yourself.

## Updates

- GenOffice looks for a newer version on the same GitHub Releases page. When one is published, **Settings ▸ About** offers it: press **Update to …**, wait for the download, then press **Restart & install**. On Windows an installer window shows the progress; when it finishes, GenOffice opens again with the documents you had open. On a Mac the app closes, is swapped for the new version and opens again with the documents you had open. That works for an app in the Applications folder; one opened straight from the disk image points you to the download page instead. The update installs only when you press that button, never when you simply close the app.
- On Linux only the AppImage updates itself. With a deb or rpm install the app tells you about the new version and opens the download page; install the new file the same way.
- **Menu (☰) ▸ Check for updates** checks whenever you ask. On a Mac it is **Help ▸ Check for updates**.
- When the check fails — no network, or nothing published yet — nothing happens, and the app keeps working as before.
- **Update Channel**, also under Settings ▸ About, is Stable or Beta. Changing it takes effect at once and checks for an update; it will not downgrade a Beta install back to Stable.
- Updates are not code-signed either. Before installing one, the app checks the downloaded file against the checksum published with that release.
- If **Restart & install** closes the app but the new version does not appear, the next launch says so and offers the update again. This time the installer opens in its own window, so you can follow it and answer an administrator prompt. If that does not work either, the update window points to the download page; installing from the file you get there keeps your settings and documents. What the updater did is written to `update-log.txt` in the app's data folder (type `%APPDATA%\GenOffice` into the File Explorer address bar to open it). Attach that file when you report the problem.

## The build you are running

**Settings ▸ About** is where the app reports the version you have, the channel it follows and where the project lives. It also names the open-source project this app is based on.

## The command line comes with it

Every install ships an `ieumoffice` command that talks to the same engines the window does, so the two never disagree about a file. `ieumoffice install-cli` puts it on your `PATH`. See [Command line and agents](help://cli) for what it can do.
