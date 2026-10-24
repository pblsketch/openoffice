# Installing GenOffice

Every version is published on the [Releases page](https://github.com/pblsketch/openoffice/releases/latest) of the project on GitHub. This version is released for Windows.

## Pick the file for your machine

| Platform    | Requirements                          | File                            |
| ----------- | ------------------------------------- | ------------------------------- |
| **Windows** | Windows 10 or later, 64-bit Intel/AMD | `GenOffice-Setup-<version>.exe` |

Older versions stay on the Releases page.

## On Windows

1. Download `GenOffice-Setup-<version>.exe` from the Releases page.
2. Run it. The installer is not code-signed, so Windows may first show a blue "Windows protected your PC" window. Choose **More info**, then **Run anyway**. The exact wording depends on your Windows version.
3. Follow the installer to the end.

It puts GenOffice in the Start menu and registers `.docx`, `.xlsx`, `.pptx`, `.pdf` and friends so double-clicking a file opens it.

Because the installer is not signed, only run one you downloaded from the Releases page above.

## Updates

- GenOffice looks for a newer version on the same GitHub Releases page. When one is published, **Settings ▸ About** offers it: press **Update to …**, wait for the download, then press **Restart & install**.
- **Menu (☰) ▸ Check for updates** checks whenever you ask. On a Mac it is **Help ▸ Check for updates**.
- When the check fails — no network, or nothing published yet — nothing happens, and the app keeps working as before.
- **Update Channel**, also under Settings ▸ About, is Stable or Beta. Changing it takes effect at once and checks for an update; it will not downgrade a Beta install back to Stable.
- Updates are not code-signed either. Before installing one, the app checks the downloaded file against the checksum published with that release.

## The build you are running

**Settings ▸ About** is where the app reports the version you have, the channel it follows and where the project lives. It also names the open-source project this app is based on.

## The command line comes with it

Every install ships an `ieumoffice` command that talks to the same engines the window does, so the two never disagree about a file. `ieumoffice install-cli` puts it on your `PATH`. See [Command line and agents](help://cli) for what it can do.
