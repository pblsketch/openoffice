import { dirname, join } from 'node:path'
import { app, dialog, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { autoUpdater, CancellationToken } from 'electron-updater'
import { installResumeDownload } from './update-resume'
import {
  clearInstallAttempt,
  installDidNotApply,
  installDirWritable,
  installFailureLevel,
  nextAttemptTries,
  readInstallAttempt,
  recordInstallAttempt,
} from './update-attempt'
import type { InstallFailureLevel } from './update-attempt'
import { createUpdateLog, UPDATE_LOG_FILE } from './update-log'
import {
  installMacStaging,
  macAppBundle,
  macSelfUpdateBlock,
  removeMacLeftovers,
  stageMacUpdate,
  startMacSwap,
} from './mac-update'
import type { UpdateLogger } from './update-log'
import { reopenedByInstaller, requestUpdateRestart, updateRestartRequested } from './update-restart'
import type { UpdateInfo } from 'electron-updater'
import { createI18n, getUiLang, htmlLang } from '@genoffice/i18n'
import { GITHUB_LATEST_RELEASE_URL, githubReleaseTagUrl } from '@genoffice/electron-utils'
import type {
  UpdateChannel,
  UpdatePhase,
  UpdateReleaseNotes,
  UpdateUiState,
  UpdateUiStrings,
} from '../shared/update-api'
import {
  clearUpdateState,
  closeUpdateWindow,
  isUpdateWindowOpen,
  pushUpdateState,
  setUpdateParentWindow,
  showUpdateWindow,
} from './update-window'
import { normalizeReleaseNotes } from './update-notes'

/**
 * Full-package auto-update from the GitHub Releases of the product's public
 * repository.
 *
 * A release carries the versioned installer and its `latest.yml`
 * (docs/releasing.ko.md is the procedure). The packaged app reads the
 * repository from resources/app-update.yml, which electron-builder bakes in
 * from the `publish` config in apps/shell/electron-builder.cjs (provider
 * `github`); nothing is injected at build time and no token is involved. A
 * repository without any release, an unreachable network, or any other
 * failed check is passed over quietly: nothing is shown and the next check
 * runs as scheduled.
 *
 * UX is the strong-guidance modal card (update-window.ts), not a native
 * dialog. Windows updates through the NSIS installer (latest.yml); macOS
 * downloads the zip target named in latest-mac.yml and installs it itself
 * (mac-update.ts); Linux through the AppImage
 * target (latest-linux.yml). On Linux only AppImage runs self-update
 * (electron-updater replaces the .AppImage file in place, no root needed);
 * deb installs have no updater — users upgrade via `apt install ./<new>.deb`.
 *
 * Dev preview: GENOFFICE_FAKE_UPDATE=<version> in an unpacked run opens the
 * window with a simulated download so the UI can be exercised end to end.
 */

const tUpd = createI18n({
  zh: {
    updTitle: '软件更新',
    updHeadline: '发现新版本',
    updDesc: '新版本包含性能改进与问题修复，建议立即更新。',
    updDownload: '立即更新',
    updLater: '最小化',
    updInstall: '立即重启安装',
    updDownloading: '正在下载更新…',
    updFailed: '更新下载失败，请检查网络后重试。',
    updRetry: '重试',
    updManual: '自动更新失败，请从下载页面获取最新版本并手动安装。',
    updUpToDate: '已是最新版本（{version}）。',
    updCheckFailed: '无法检查更新，请检查网络后重试。',
    updOpenDownload: '前往下载页面',
    updNotesLabel: '更新内容',
    updNotesOnGitHub: '在 GitHub 查看完整说明',
    updNotesTruncated: '仅显示部分内容。',
    updManualMac:
      '此 Mac 无法自动安装更新。请从下载页面获取新版本并放入“应用程序”文件夹。如果你是直接从磁盘映像打开的应用，请把它移到“应用程序”文件夹，之后的更新就会自动安装。',
    updInstallFailed: '上次更新未能安装。这次将以窗口方式打开安装程序，以便查看安装进度。',
    updVisibleInstall:
      '重启后将显示安装进度窗口。如果 Windows 请求管理员授权，请选择“是”。安装完成后，应用和之前打开的文档会重新打开。',
    updRestartNote: '重启后将显示安装进度窗口。安装完成后，应用和之前打开的文档会重新打开。',
    updRestartNoteMac: '应用会关闭，替换为新版本后重新打开，之前打开的文档也会重新打开。',
  },
  en: {
    updTitle: 'Software Update',
    updHeadline: 'A new version is available',
    updDesc:
      'This update includes performance improvements and bug fixes. We recommend updating now.',
    updDownload: 'Update Now',
    updLater: 'Minimize',
    updInstall: 'Restart & Install',
    updDownloading: 'Downloading update…',
    updFailed: 'Update download failed. Check your network and try again.',
    updRetry: 'Retry',
    updManual:
      'Automatic update failed. Please get the latest version from the download page and install it manually.',
    updUpToDate: "You're up to date (version {version}).",
    updCheckFailed: "Couldn't check for updates. Check your network and try again.",
    updOpenDownload: 'Open Download Page',
    updNotesLabel: "What's new",
    updNotesOnGitHub: 'View full notes on GitHub',
    updNotesTruncated: 'Only part of the notes is shown.',
    updManualMac:
      "This Mac can't install the update automatically. Download the new version from the download page and put it in the Applications folder. If you opened the app straight from the disk image, move it to Applications and later updates install by themselves.",
    updInstallFailed:
      'The last update did not install. This time the installer opens in its own window so you can see its progress.',
    updVisibleInstall:
      'After the restart an installer window shows the progress. If Windows asks for administrator approval, choose Yes. When it finishes, the app and the documents you had open come back.',
    updRestartNote:
      'After the restart an installer window shows the progress. When it finishes, the app and the documents you had open come back.',
    updRestartNoteMac:
      'The app closes, is replaced with the new version and opens again, along with the documents you had open.',
  },
  vi: {
    updTitle: 'Cập nhật phần mềm',
    updHeadline: 'Đã có phiên bản mới',
    updDesc:
      'Bản cập nhật này bao gồm các cải tiến hiệu suất và sửa lỗi. Chúng tôi khuyên bạn nên cập nhật ngay bây giờ.',
    updDownload: 'Cập nhật ngay',
    updLater: 'Thu nhỏ',
    updInstall: 'Khởi động lại & Cài đặt',
    updDownloading: 'Đang tải xuống bản cập nhật…',
    updFailed: 'Tải xuống bản cập nhật thất bại. Kiểm tra mạng của bạn và thử lại.',
    updRetry: 'Thử lại',
    updManual:
      'Cập nhật tự động thất bại. Vui lòng lấy phiên bản mới nhất từ trang tải xuống và cài đặt thủ công.',
    updUpToDate: 'Bạn đang sử dụng phiên bản mới nhất (phiên bản {version}).',
    updCheckFailed: 'Không thể kiểm tra bản cập nhật. Kiểm tra mạng của bạn và thử lại.',
    updOpenDownload: 'Mở trang tải xuống',
    updNotesLabel: 'Có gì mới',
    updNotesOnGitHub: 'Xem toàn bộ trên GitHub',
    updNotesTruncated: 'Chỉ hiển thị một phần.',
    updManualMac:
      'Máy Mac này không thể tự động cài đặt bản cập nhật. Hãy tải phiên bản mới từ trang tải xuống và đặt vào thư mục Ứng dụng. Nếu bạn mở ứng dụng trực tiếp từ ảnh đĩa, hãy chuyển nó vào thư mục Ứng dụng để các bản cập nhật sau tự cài đặt.',
    updInstallFailed:
      'Bản cập nhật lần trước chưa được cài đặt. Lần này trình cài đặt sẽ mở trong cửa sổ riêng để bạn theo dõi tiến trình.',
    updVisibleInstall:
      'Sau khi khởi động lại, một cửa sổ sẽ hiển thị tiến trình cài đặt. Nếu Windows yêu cầu quyền quản trị viên, hãy chọn Có. Khi hoàn tất, ứng dụng và các tài liệu bạn đang mở sẽ được mở lại.',
    updRestartNote:
      'Sau khi khởi động lại, một cửa sổ sẽ hiển thị tiến trình cài đặt. Khi hoàn tất, ứng dụng và các tài liệu bạn đang mở sẽ được mở lại.',
    updRestartNoteMac:
      'Ứng dụng sẽ đóng, được thay bằng phiên bản mới rồi mở lại cùng các tài liệu bạn đang mở.',
  },
  ja: {
    updTitle: 'ソフトウェアアップデート',
    updHeadline: '新しいバージョンがあります',
    updDesc:
      'このアップデートにはパフォーマンス改善とバグ修正が含まれます。今すぐの更新をおすすめします。',
    updDownload: '今すぐ更新',
    updLater: '最小化',
    updInstall: '再起動してインストール',
    updDownloading: 'アップデートをダウンロード中…',
    updFailed: 'ダウンロードに失敗しました。ネットワークを確認して再試行してください。',
    updRetry: '再試行',
    updManual:
      '自動更新に失敗しました。ダウンロードページから最新バージョンを取得して手動でインストールしてください。',
    updUpToDate: '最新の状態です（バージョン {version}）。',
    updCheckFailed: '更新を確認できませんでした。ネットワークを確認して再試行してください。',
    updOpenDownload: 'ダウンロードページを開く',
    updNotesLabel: '更新内容',
    updNotesOnGitHub: 'GitHub で全体を見る',
    updNotesTruncated: '一部のみ表示しています。',
    updManualMac:
      'このMacではアップデートを自動でインストールできません。ダウンロードページから新しいバージョンを入手し、「アプリケーション」フォルダに入れてください。ディスクイメージから直接アプリを開いた場合は、「アプリケーション」フォルダに移動すると、次回からアップデートが自動でインストールされます。',
    updInstallFailed:
      '前回のアップデートはインストールされませんでした。今回はインストーラーをウィンドウで開き、進行状況を表示します。',
    updVisibleInstall:
      '再起動するとインストールの進行状況を示すウィンドウが表示されます。Windows が管理者の承認を求めたら「はい」を選んでください。完了すると、アプリと開いていた文書が再び開きます。',
    updRestartNote:
      '再起動するとインストールの進行状況を示すウィンドウが表示されます。完了すると、アプリと開いていた文書が再び開きます。',
    updRestartNoteMac:
      'アプリが終了し、新しいバージョンに置き換えられてから再び開きます。開いていた書類も再び開きます。',
  },
  ko: {
    updTitle: '소프트웨어 업데이트',
    updHeadline: '새 버전이 있습니다',
    updDesc:
      '이 업데이트에는 성능 개선과 버그 수정이 포함되어 있습니다. 지금 업데이트하는 것을 권장합니다.',
    updDownload: '지금 업데이트',
    updLater: '최소화',
    updInstall: '다시 시작 및 설치',
    updDownloading: '업데이트 다운로드 중…',
    updFailed: '업데이트 다운로드에 실패했습니다. 네트워크를 확인한 후 다시 시도하세요.',
    updRetry: '다시 시도',
    updManual:
      '자동 업데이트에 실패했습니다. 다운로드 페이지에서 최신 버전을 받아 직접 설치해 주세요.',
    updUpToDate: '최신 버전입니다 (버전 {version}).',
    updCheckFailed: '업데이트를 확인할 수 없습니다. 네트워크를 확인한 후 다시 시도하세요.',
    updOpenDownload: '다운로드 페이지 열기',
    updNotesLabel: '업데이트 내용',
    updNotesOnGitHub: 'GitHub에서 전체 보기',
    updNotesTruncated: '일부만 표시했습니다.',
    updManualMac:
      '이 Mac에서는 업데이트를 자동으로 설치할 수 없습니다. 다운로드 페이지에서 새 버전을 받아 응용 프로그램 폴더에 넣어 주세요. 디스크 이미지에서 앱을 바로 열었다면 응용 프로그램 폴더로 옮겨 두세요. 다음 업데이트부터는 저절로 설치됩니다.',
    updInstallFailed:
      '지난번 업데이트가 설치되지 않았습니다. 이번에는 설치 프로그램을 창으로 띄워 진행 상황을 보여 드립니다.',
    updVisibleInstall:
      "다시 시작하면 설치 진행 창이 뜹니다. 관리자 승인을 묻는 창이 나오면 '예'를 눌러 주세요. 설치가 끝나면 앱과 열려 있던 문서가 다시 열립니다.",
    updRestartNote:
      '다시 시작하면 설치 진행 창이 뜹니다. 설치가 끝나면 앱과 열려 있던 문서가 다시 열립니다.',
    updRestartNoteMac:
      '앱이 닫히고 새 버전으로 바뀐 뒤 다시 열립니다. 열어 두었던 문서도 다시 열립니다.',
  },
  fr: {
    updTitle: 'Mise à jour logicielle',
    updHeadline: 'Une nouvelle version est disponible',
    updDesc:
      'Cette mise à jour apporte des améliorations de performances et des corrections de bogues. Nous vous recommandons de mettre à jour maintenant.',
    updDownload: 'Mettre à jour',
    updLater: 'Réduire',
    updInstall: 'Redémarrer et installer',
    updDownloading: 'Téléchargement de la mise à jour…',
    updFailed: 'Échec du téléchargement. Vérifiez votre réseau et réessayez.',
    updRetry: 'Réessayer',
    updManual:
      'La mise à jour automatique a échoué. Téléchargez la dernière version depuis la page de téléchargement et installez-la manuellement.',
    updUpToDate: 'Vous êtes à jour (version {version}).',
    updCheckFailed:
      'Impossible de rechercher les mises à jour. Vérifiez votre réseau et réessayez.',
    updOpenDownload: 'Ouvrir la page de téléchargement',
    updNotesLabel: 'Nouveautés',
    updNotesOnGitHub: 'Voir les notes complètes sur GitHub',
    updNotesTruncated: 'Seule une partie du contenu est affichée.',
    updManualMac:
      "Ce Mac ne peut pas installer la mise à jour automatiquement. Téléchargez la nouvelle version depuis la page de téléchargement et placez-la dans le dossier Applications. Si vous avez ouvert l'app directement depuis l'image disque, déplacez-la dans Applications : les mises à jour suivantes s'installeront d'elles-mêmes.",
    updInstallFailed:
      "La dernière mise à jour ne s'est pas installée. Cette fois, le programme d'installation s'ouvre dans sa propre fenêtre pour que vous puissiez suivre sa progression.",
    updVisibleInstall:
      "Après le redémarrage, une fenêtre affiche la progression de l'installation. Si Windows demande l'autorisation d'un administrateur, choisissez Oui. Une fois l'installation terminée, l'application et les documents ouverts reviennent.",
    updRestartNote:
      "Après le redémarrage, une fenêtre affiche la progression de l'installation. Une fois l'installation terminée, l'application et les documents ouverts reviennent.",
    updRestartNoteMac:
      "L'app se ferme, est remplacée par la nouvelle version, puis se rouvre avec les documents que vous aviez ouverts.",
  },
  de: {
    updTitle: 'Softwareaktualisierung',
    updHeadline: 'Eine neue Version ist verfügbar',
    updDesc:
      'Dieses Update enthält Leistungsverbesserungen und Fehlerbehebungen. Wir empfehlen, jetzt zu aktualisieren.',
    updDownload: 'Jetzt aktualisieren',
    updLater: 'Minimieren',
    updInstall: 'Neu starten und installieren',
    updDownloading: 'Update wird heruntergeladen…',
    updFailed:
      'Download fehlgeschlagen. Prüfen Sie Ihre Netzwerkverbindung und versuchen Sie es erneut.',
    updRetry: 'Erneut versuchen',
    updManual:
      'Automatisches Update fehlgeschlagen. Laden Sie die neueste Version von der Download-Seite herunter und installieren Sie sie manuell.',
    updUpToDate: 'Sie sind auf dem neuesten Stand (Version {version}).',
    updCheckFailed:
      'Updates konnten nicht geprüft werden. Prüfen Sie Ihre Netzwerkverbindung und versuchen Sie es erneut.',
    updOpenDownload: 'Download-Seite öffnen',
    updNotesLabel: 'Neuerungen',
    updNotesOnGitHub: 'Vollständige Hinweise auf GitHub',
    updNotesTruncated: 'Es wird nur ein Teil angezeigt.',
    updManualMac:
      'Dieser Mac kann das Update nicht automatisch installieren. Laden Sie die neue Version von der Download-Seite herunter und legen Sie sie in den Ordner „Programme“. Wenn Sie die App direkt aus dem Disk-Image geöffnet haben, verschieben Sie sie in „Programme“; spätere Updates installieren sich dann von selbst.',
    updInstallFailed:
      'Das letzte Update wurde nicht installiert. Diesmal öffnet sich das Installationsprogramm in einem eigenen Fenster, damit Sie den Fortschritt sehen.',
    updVisibleInstall:
      'Nach dem Neustart zeigt ein Fenster den Installationsfortschritt. Wenn Windows nach Administratorrechten fragt, wählen Sie „Ja“. Danach öffnen sich die App und Ihre geöffneten Dokumente wieder.',
    updRestartNote:
      'Nach dem Neustart zeigt ein Fenster den Installationsfortschritt. Danach öffnen sich die App und Ihre geöffneten Dokumente wieder.',
    updRestartNoteMac:
      'Die App wird geschlossen, durch die neue Version ersetzt und wieder geöffnet, zusammen mit den Dokumenten, die Sie geöffnet hatten.',
  },
  es: {
    updTitle: 'Actualización de software',
    updHeadline: 'Hay una nueva versión disponible',
    updDesc:
      'Esta actualización incluye mejoras de rendimiento y correcciones de errores. Recomendamos actualizar ahora.',
    updDownload: 'Actualizar ahora',
    updLater: 'Minimizar',
    updInstall: 'Reiniciar e instalar',
    updDownloading: 'Descargando la actualización…',
    updFailed: 'Error al descargar. Compruebe su red e inténtelo de nuevo.',
    updRetry: 'Reintentar',
    updManual:
      'La actualización automática falló. Descargue la última versión desde la página de descargas e instálela manualmente.',
    updUpToDate: 'Está actualizado (versión {version}).',
    updCheckFailed: 'No se pudo buscar actualizaciones. Compruebe su red e inténtelo de nuevo.',
    updOpenDownload: 'Abrir página de descargas',
    updNotesLabel: 'Novedades',
    updNotesOnGitHub: 'Ver notas completas en GitHub',
    updNotesTruncated: 'Solo se muestra una parte.',
    updManualMac:
      'Este Mac no puede instalar la actualización automáticamente. Descarga la nueva versión desde la página de descargas y colócala en la carpeta Aplicaciones. Si abriste la app directamente desde la imagen de disco, muévela a Aplicaciones y las próximas actualizaciones se instalarán solas.',
    updInstallFailed:
      'La última actualización no se instaló. Esta vez el instalador se abre en su propia ventana para que pueda ver su progreso.',
    updVisibleInstall:
      'Tras el reinicio, una ventana muestra el progreso de la instalación. Si Windows pide la aprobación de un administrador, elija Sí. Al terminar, la aplicación y los documentos que tenía abiertos vuelven a abrirse.',
    updRestartNote:
      'Tras el reinicio, una ventana muestra el progreso de la instalación. Al terminar, la aplicación y los documentos que tenía abiertos vuelven a abrirse.',
    updRestartNoteMac:
      'La app se cierra, se reemplaza por la nueva versión y se vuelve a abrir con los documentos que tenías abiertos.',
  },
  th: {
    updTitle: 'อัปเดตซอฟต์แวร์',
    updHeadline: 'มีเวอร์ชันใหม่พร้อมใช้งาน',
    updDesc: 'การอัปเดตนี้มีการปรับปรุงประสิทธิภาพและแก้ไขข้อบกพร่อง แนะนำให้อัปเดตทันที',
    updDownload: 'อัปเดตเลย',
    updLater: 'ย่อเก็บ',
    updInstall: 'รีสตาร์ทและติดตั้ง',
    updDownloading: 'กำลังดาวน์โหลดอัปเดต…',
    updFailed: 'ดาวน์โหลดไม่สำเร็จ โปรดตรวจสอบเครือข่ายแล้วลองอีกครั้ง',
    updRetry: 'ลองอีกครั้ง',
    updManual:
      'การอัปเดตอัตโนมัติล้มเหลว โปรดดาวน์โหลดเวอร์ชันล่าสุดจากหน้าดาวน์โหลดแล้วติดตั้งด้วยตนเอง',
    updUpToDate: 'คุณใช้เวอร์ชันล่าสุดแล้ว (เวอร์ชัน {version})',
    updCheckFailed: 'ไม่สามารถตรวจหาการอัปเดตได้ โปรดตรวจสอบเครือข่ายแล้วลองอีกครั้ง',
    updOpenDownload: 'เปิดหน้าดาวน์โหลด',
    updNotesLabel: 'มีอะไรใหม่',
    updNotesOnGitHub: 'ดูบันทึกฉบับเต็มบน GitHub',
    updNotesTruncated: 'แสดงเพียงบางส่วน',
    updManualMac:
      'Mac เครื่องนี้ติดตั้งอัปเดตโดยอัตโนมัติไม่ได้ โปรดดาวน์โหลดเวอร์ชันใหม่จากหน้าดาวน์โหลดแล้ววางไว้ในโฟลเดอร์แอปพลิเคชัน หากคุณเปิดแอปจากดิสก์อิมเมจโดยตรง ให้ย้ายแอปไปไว้ในโฟลเดอร์แอปพลิเคชัน แล้วอัปเดตครั้งต่อไปจะติดตั้งเอง',
    updInstallFailed:
      'การอัปเดตครั้งก่อนไม่ได้ติดตั้ง ครั้งนี้ตัวติดตั้งจะเปิดในหน้าต่างของตัวเองเพื่อให้คุณเห็นความคืบหน้า',
    updVisibleInstall:
      'หลังรีสตาร์ท จะมีหน้าต่างแสดงความคืบหน้าการติดตั้ง หาก Windows ขอการอนุมัติจากผู้ดูแลระบบ ให้เลือก ใช่ เมื่อติดตั้งเสร็จ แอปและเอกสารที่เปิดไว้จะเปิดขึ้นอีกครั้ง',
    updRestartNote:
      'หลังรีสตาร์ท จะมีหน้าต่างแสดงความคืบหน้าการติดตั้ง เมื่อติดตั้งเสร็จ แอปและเอกสารที่เปิดไว้จะเปิดขึ้นอีกครั้ง',
    updRestartNoteMac:
      'แอปจะปิด เปลี่ยนเป็นเวอร์ชันใหม่ แล้วเปิดขึ้นอีกครั้งพร้อมเอกสารที่คุณเปิดไว้',
  },
  id: {
    updTitle: 'Pembaruan Perangkat Lunak',
    updHeadline: 'Versi baru tersedia',
    updDesc:
      'Pembaruan ini mencakup peningkatan kinerja dan perbaikan bug. Kami menyarankan untuk memperbarui sekarang.',
    updDownload: 'Perbarui Sekarang',
    updLater: 'Minimalkan',
    updInstall: 'Mulai Ulang & Pasang',
    updDownloading: 'Mengunduh pembaruan…',
    updFailed: 'Unduhan gagal. Periksa jaringan Anda dan coba lagi.',
    updRetry: 'Coba Lagi',
    updManual:
      'Pembaruan otomatis gagal. Silakan unduh versi terbaru dari halaman unduhan dan pasang secara manual.',
    updUpToDate: 'Sudah versi terbaru (versi {version}).',
    updCheckFailed: 'Tidak dapat memeriksa pembaruan. Periksa jaringan Anda dan coba lagi.',
    updOpenDownload: 'Buka Halaman Unduhan',
    updNotesLabel: 'Yang baru',
    updNotesOnGitHub: 'Lihat catatan lengkap di GitHub',
    updNotesTruncated: 'Hanya sebagian yang ditampilkan.',
    updManualMac:
      'Mac ini tidak dapat memasang pembaruan secara otomatis. Unduh versi baru dari halaman unduhan lalu letakkan di folder Aplikasi. Jika Anda membuka aplikasi langsung dari image disk, pindahkan ke folder Aplikasi agar pembaruan berikutnya terpasang sendiri.',
    updInstallFailed:
      'Pembaruan terakhir tidak terpasang. Kali ini penginstal dibuka di jendelanya sendiri agar Anda dapat melihat kemajuannya.',
    updVisibleInstall:
      'Setelah dimulai ulang, sebuah jendela menampilkan kemajuan pemasangan. Jika Windows meminta persetujuan administrator, pilih Ya. Setelah selesai, aplikasi dan dokumen yang tadi terbuka akan dibuka kembali.',
    updRestartNote:
      'Setelah dimulai ulang, sebuah jendela menampilkan kemajuan pemasangan. Setelah selesai, aplikasi dan dokumen yang tadi terbuka akan dibuka kembali.',
    updRestartNoteMac:
      'Aplikasi akan ditutup, diganti dengan versi baru, lalu dibuka kembali bersama dokumen yang tadi terbuka.',
  },
  ru: {
    updTitle: 'Обновление программы',
    updHeadline: 'Доступна новая версия',
    updDesc:
      'Это обновление содержит улучшения производительности и исправления ошибок. Рекомендуем обновиться сейчас.',
    updDownload: 'Обновить сейчас',
    updLater: 'Свернуть',
    updInstall: 'Перезапустить и установить',
    updDownloading: 'Загрузка обновления…',
    updFailed: 'Не удалось загрузить обновление. Проверьте сеть и повторите попытку.',
    updRetry: 'Повторить',
    updManual:
      'Автоматическое обновление не удалось. Скачайте последнюю версию со страницы загрузки и установите её вручную.',
    updUpToDate: 'У вас последняя версия ({version}).',
    updCheckFailed: 'Не удалось проверить обновления. Проверьте сеть и повторите попытку.',
    updOpenDownload: 'Открыть страницу загрузки',
    updNotesLabel: 'Что нового',
    updNotesOnGitHub: 'Полные примечания на GitHub',
    updNotesTruncated: 'Показана только часть.',
    updManualMac:
      'Этот Mac не может установить обновление автоматически. Скачайте новую версию со страницы загрузки и поместите её в папку «Программы». Если вы открыли приложение прямо из образа диска, перенесите его в «Программы» — следующие обновления будут устанавливаться сами.',
    updInstallFailed:
      'Последнее обновление не установилось. На этот раз установщик откроется в отдельном окне, чтобы вы видели ход установки.',
    updVisibleInstall:
      'После перезапуска откроется окно с ходом установки. Если Windows запросит разрешение администратора, выберите «Да». По завершении приложение и открытые документы откроются снова.',
    updRestartNote:
      'После перезапуска откроется окно с ходом установки. По завершении приложение и открытые документы откроются снова.',
    updRestartNoteMac:
      'Приложение закроется, заменится новой версией и откроется снова вместе с документами, которые были открыты.',
  },
  ar: {
    updTitle: 'تحديث البرنامج',
    updHeadline: 'يتوفر إصدار جديد',
    updDesc: 'يتضمن هذا التحديث تحسينات في الأداء وإصلاحات للأخطاء. نوصي بالتحديث الآن.',
    updDownload: 'التحديث الآن',
    updLater: 'تصغير',
    updInstall: 'إعادة التشغيل والتثبيت',
    updDownloading: 'جارٍ تنزيل التحديث…',
    updFailed: 'فشل تنزيل التحديث. تحقق من الشبكة وحاول مرة أخرى.',
    updRetry: 'إعادة المحاولة',
    updManual: 'فشل التحديث التلقائي. يرجى تنزيل أحدث إصدار من صفحة التنزيل وتثبيته يدويًا.',
    updUpToDate: 'أنت على أحدث إصدار (الإصدار {version}).',
    updCheckFailed: 'تعذر التحقق من التحديثات. تحقق من الشبكة وحاول مرة أخرى.',
    updOpenDownload: 'فتح صفحة التنزيل',
    updNotesLabel: 'ما الجديد',
    updNotesOnGitHub: 'عرض الملاحظات الكاملة على GitHub',
    updNotesTruncated: 'يُعرض جزء فقط.',
    updManualMac:
      'لا يستطيع جهاز Mac هذا تثبيت التحديث تلقائيًا. نزّل الإصدار الجديد من صفحة التنزيل وضعه في مجلد التطبيقات. إذا فتحت التطبيق مباشرة من صورة القرص، فانقله إلى مجلد التطبيقات وستُثبَّت التحديثات التالية تلقائيًا.',
    updInstallFailed:
      'لم يتم تثبيت التحديث الأخير. هذه المرة سيفتح برنامج التثبيت في نافذته الخاصة لتتمكن من متابعة التقدم.',
    updVisibleInstall:
      'بعد إعادة التشغيل تظهر نافذة تعرض تقدم التثبيت. إذا طلب Windows موافقة المسؤول، فاختر نعم. عند الانتهاء يُعاد فتح التطبيق والمستندات التي كانت مفتوحة.',
    updRestartNote:
      'بعد إعادة التشغيل تظهر نافذة تعرض تقدم التثبيت. عند الانتهاء يُعاد فتح التطبيق والمستندات التي كانت مفتوحة.',
    updRestartNoteMac:
      'سيُغلق التطبيق ويُستبدل بالإصدار الجديد ثم يُفتح مجددًا مع المستندات التي كانت مفتوحة.',
  },
  pt: {
    updTitle: 'Atualização de Software',
    updHeadline: 'Uma nova versão está disponível',
    updDesc:
      'Esta atualização inclui melhorias de desempenho e correções de erros. Recomendamos atualizar agora.',
    updDownload: 'Atualizar agora',
    updLater: 'Minimizar',
    updInstall: 'Reiniciar e instalar',
    updDownloading: 'Baixando a atualização…',
    updFailed: 'Falha no download. Verifique sua rede e tente novamente.',
    updRetry: 'Tentar novamente',
    updManual:
      'A atualização automática falhou. Baixe a versão mais recente na página de download e instale manualmente.',
    updUpToDate: 'Você está atualizado (versão {version}).',
    updCheckFailed: 'Não foi possível procurar atualizações. Verifique sua rede e tente novamente.',
    updOpenDownload: 'Abrir página de download',
    updNotesLabel: 'Novidades',
    updNotesOnGitHub: 'Ver notas completas no GitHub',
    updNotesTruncated: 'Apenas parte do conteúdo é exibida.',
    updManualMac:
      'Este Mac não consegue instalar a atualização automaticamente. Baixe a nova versão na página de download e coloque-a na pasta Aplicativos. Se você abriu o app direto da imagem de disco, mova-o para Aplicativos e as próximas atualizações serão instaladas sozinhas.',
    updInstallFailed:
      'A última atualização não foi instalada. Desta vez o instalador abre em sua própria janela para você acompanhar o progresso.',
    updVisibleInstall:
      'Após reiniciar, uma janela mostra o progresso da instalação. Se o Windows pedir aprovação de administrador, escolha Sim. Ao terminar, o aplicativo e os documentos que estavam abertos são reabertos.',
    updRestartNote:
      'Após reiniciar, uma janela mostra o progresso da instalação. Ao terminar, o aplicativo e os documentos que estavam abertos são reabertos.',
    updRestartNoteMac:
      'O app fecha, é substituído pela nova versão e abre de novo, junto com os documentos que estavam abertos.',
  },
  it: {
    updTitle: 'Aggiornamento software',
    updHeadline: 'È disponibile una nuova versione',
    updDesc:
      'Questo aggiornamento include miglioramenti delle prestazioni e correzioni di bug. Consigliamo di aggiornare subito.',
    updDownload: 'Aggiorna ora',
    updLater: 'Riduci a icona',
    updInstall: 'Riavvia e installa',
    updDownloading: "Download dell'aggiornamento…",
    updFailed: 'Download non riuscito. Controlla la rete e riprova.',
    updRetry: 'Riprova',
    updManual:
      "Aggiornamento automatico non riuscito. Scarica l'ultima versione dalla pagina di download e installala manualmente.",
    updUpToDate: 'Sei aggiornato (versione {version}).',
    updCheckFailed: 'Impossibile controllare gli aggiornamenti. Verifica la rete e riprova.',
    updOpenDownload: 'Apri pagina di download',
    updNotesLabel: 'Novità',
    updNotesOnGitHub: 'Vedi le note complete su GitHub',
    updNotesTruncated: 'È mostrata solo una parte.',
    updManualMac:
      "Questo Mac non può installare l'aggiornamento automaticamente. Scarica la nuova versione dalla pagina di download e mettila nella cartella Applicazioni. Se hai aperto l'app direttamente dall'immagine disco, spostala in Applicazioni e i prossimi aggiornamenti si installeranno da soli.",
    updInstallFailed:
      "L'ultimo aggiornamento non è stato installato. Questa volta il programma di installazione si apre in una finestra propria, così puoi seguirne l'avanzamento.",
    updVisibleInstall:
      "Dopo il riavvio una finestra mostra l'avanzamento dell'installazione. Se Windows chiede l'approvazione di un amministratore, scegli Sì. Al termine l'app e i documenti aperti si riaprono.",
    updRestartNote:
      "Dopo il riavvio una finestra mostra l'avanzamento dell'installazione. Al termine l'app e i documenti aperti si riaprono.",
    updRestartNoteMac:
      "L'app si chiude, viene sostituita dalla nuova versione e si riapre insieme ai documenti che avevi aperto.",
  },
  pl: {
    updTitle: 'Aktualizacja oprogramowania',
    updHeadline: 'Dostępna jest nowa wersja',
    updDesc:
      'Ta aktualizacja zawiera ulepszenia wydajności i poprawki błędów. Zalecamy aktualizację teraz.',
    updDownload: 'Aktualizuj teraz',
    updLater: 'Zminimalizuj',
    updInstall: 'Uruchom ponownie i zainstaluj',
    updDownloading: 'Pobieranie aktualizacji…',
    updFailed: 'Pobieranie nie powiodło się. Sprawdź sieć i spróbuj ponownie.',
    updRetry: 'Spróbuj ponownie',
    updManual:
      'Automatyczna aktualizacja nie powiodła się. Pobierz najnowszą wersję ze strony pobierania i zainstaluj ją ręcznie.',
    updUpToDate: 'Masz aktualną wersję ({version}).',
    updCheckFailed: 'Nie udało się sprawdzić aktualizacji. Sprawdź sieć i spróbuj ponownie.',
    updOpenDownload: 'Otwórz stronę pobierania',
    updNotesLabel: 'Co nowego',
    updNotesOnGitHub: 'Zobacz pełne informacje na GitHubie',
    updNotesTruncated: 'Wyświetlana jest tylko część.',
    updManualMac:
      'Ten Mac nie może automatycznie zainstalować aktualizacji. Pobierz nową wersję ze strony pobierania i umieść ją w folderze Aplikacje. Jeśli aplikacja została otwarta bezpośrednio z obrazu dysku, przenieś ją do folderu Aplikacje, a kolejne aktualizacje zainstalują się same.',
    updInstallFailed:
      'Ostatnia aktualizacja nie została zainstalowana. Tym razem instalator otworzy się we własnym oknie, aby można było śledzić postęp.',
    updVisibleInstall:
      'Po ponownym uruchomieniu okno pokaże postęp instalacji. Jeśli system Windows poprosi o zgodę administratora, wybierz Tak. Po zakończeniu aplikacja i otwarte dokumenty otworzą się ponownie.',
    updRestartNote:
      'Po ponownym uruchomieniu okno pokaże postęp instalacji. Po zakończeniu aplikacja i otwarte dokumenty otworzą się ponownie.',
    updRestartNoteMac:
      'Aplikacja zamknie się, zostanie zastąpiona nową wersją i otworzy się ponownie razem z otwartymi wcześniej dokumentami.',
  },
  cs: {
    updTitle: 'Aktualizace softwaru',
    updHeadline: 'Je k dispozici nová verze',
    updDesc:
      'Tato aktualizace obsahuje vylepšení výkonu a opravy chyb. Doporučujeme aktualizovat hned.',
    updDownload: 'Aktualizovat nyní',
    updLater: 'Minimalizovat',
    updInstall: 'Restartovat a nainstalovat',
    updDownloading: 'Stahování aktualizace…',
    updFailed: 'Stažení aktualizace se nezdařilo. Zkontrolujte síť a zkuste to znovu.',
    updRetry: 'Zkusit znovu',
    updManual:
      'Automatická aktualizace se nezdařila. Stáhněte si nejnovější verzi ze stránky pro stažení a nainstalujte ji ručně.',
    updUpToDate: 'Máte aktuální verzi ({version}).',
    updCheckFailed: 'Aktualizace se nepodařilo zkontrolovat. Zkontrolujte síť a zkuste to znovu.',
    updOpenDownload: 'Otevřít stránku pro stažení',
    updNotesLabel: 'Co je nového',
    updNotesOnGitHub: 'Zobrazit úplné poznámky na GitHubu',
    updNotesTruncated: 'Zobrazuje se jen část.',
    updManualMac:
      'Tento Mac nemůže aktualizaci nainstalovat automaticky. Stáhněte novou verzi ze stránky pro stažení a vložte ji do složky Aplikace. Pokud jste aplikaci otevřeli přímo z obrazu disku, přesuňte ji do složky Aplikace a další aktualizace se nainstalují samy.',
    updInstallFailed:
      'Poslední aktualizace se nenainstalovala. Tentokrát se instalátor otevře ve vlastním okně, abyste viděli průběh.',
    updVisibleInstall:
      'Po restartu se zobrazí okno s průběhem instalace. Pokud Windows požádá o souhlas správce, zvolte Ano. Po dokončení se aplikace a otevřené dokumenty znovu otevřou.',
    updRestartNote:
      'Po restartu se zobrazí okno s průběhem instalace. Po dokončení se aplikace a otevřené dokumenty znovu otevřou.',
    updRestartNoteMac:
      'Aplikace se zavře, nahradí se novou verzí a znovu se otevře i s dokumenty, které jste měli otevřené.',
  },
  nl: {
    updTitle: 'Software-update',
    updHeadline: 'Er is een nieuwe versie beschikbaar',
    updDesc:
      'Deze update bevat prestatieverbeteringen en foutoplossingen. We raden aan nu bij te werken.',
    updDownload: 'Nu bijwerken',
    updLater: 'Minimaliseren',
    updInstall: 'Opnieuw starten en installeren',
    updDownloading: 'Update wordt gedownload…',
    updFailed: 'Download mislukt. Controleer uw netwerk en probeer het opnieuw.',
    updRetry: 'Opnieuw proberen',
    updManual:
      'Automatische update mislukt. Download de nieuwste versie via de downloadpagina en installeer deze handmatig.',
    updUpToDate: 'U bent up-to-date (versie {version}).',
    updCheckFailed:
      'Kan niet controleren op updates. Controleer uw netwerk en probeer het opnieuw.',
    updOpenDownload: 'Downloadpagina openen',
    updNotesLabel: 'Wat is er nieuw',
    updNotesOnGitHub: 'Volledige notities op GitHub',
    updNotesTruncated: 'Er wordt slechts een deel weergegeven.',
    updManualMac:
      'Deze Mac kan de update niet automatisch installeren. Download de nieuwe versie van de downloadpagina en zet die in de map Apps. Hebt u de app rechtstreeks vanuit de schijfkopie geopend, verplaats hem dan naar Apps; volgende updates installeren zich dan vanzelf.',
    updInstallFailed:
      'De laatste update is niet geïnstalleerd. Deze keer opent het installatieprogramma in een eigen venster, zodat u de voortgang ziet.',
    updVisibleInstall:
      'Na het herstarten toont een venster de voortgang van de installatie. Als Windows om toestemming van een beheerder vraagt, kiest u Ja. Daarna worden de app en uw geopende documenten weer geopend.',
    updRestartNote:
      'Na het herstarten toont een venster de voortgang van de installatie. Daarna worden de app en uw geopende documenten weer geopend.',
    updRestartNoteMac:
      'De app sluit, wordt vervangen door de nieuwe versie en opent opnieuw, samen met de documenten die u open had.',
  },
  ms: {
    updTitle: 'Kemas Kini Perisian',
    updHeadline: 'Versi baharu tersedia',
    updDesc:
      'Kemas kini ini merangkumi penambahbaikan prestasi dan pembetulan pepijat. Kami syorkan kemas kini sekarang.',
    updDownload: 'Kemas Kini Sekarang',
    updLater: 'Minimumkan',
    updInstall: 'Mula Semula & Pasang',
    updDownloading: 'Memuat turun kemas kini…',
    updFailed: 'Muat turun gagal. Semak rangkaian anda dan cuba lagi.',
    updRetry: 'Cuba Lagi',
    updManual:
      'Kemas kini automatik gagal. Sila muat turun versi terkini dari halaman muat turun dan pasang secara manual.',
    updUpToDate: 'Anda menggunakan versi terkini (versi {version}).',
    updCheckFailed: 'Tidak dapat menyemak kemas kini. Semak rangkaian anda dan cuba lagi.',
    updOpenDownload: 'Buka Halaman Muat Turun',
    updNotesLabel: 'Apa yang baharu',
    updNotesOnGitHub: 'Lihat nota penuh di GitHub',
    updNotesTruncated: 'Hanya sebahagian dipaparkan.',
    updManualMac:
      'Mac ini tidak dapat memasang kemas kini secara automatik. Muat turun versi baharu dari halaman muat turun dan letakkannya dalam folder Aplikasi. Jika anda membuka aplikasi terus dari imej cakera, alihkannya ke folder Aplikasi supaya kemas kini seterusnya dipasang dengan sendirinya.',
    updInstallFailed:
      'Kemas kini terakhir tidak dipasang. Kali ini pemasang dibuka dalam tetingkapnya sendiri supaya anda dapat melihat kemajuannya.',
    updVisibleInstall:
      'Selepas dimulakan semula, satu tetingkap menunjukkan kemajuan pemasangan. Jika Windows meminta kelulusan pentadbir, pilih Ya. Apabila selesai, aplikasi dan dokumen yang dibuka tadi akan dibuka semula.',
    updRestartNote:
      'Selepas dimulakan semula, satu tetingkap menunjukkan kemajuan pemasangan. Apabila selesai, aplikasi dan dokumen yang dibuka tadi akan dibuka semula.',
    updRestartNoteMac:
      'Aplikasi akan ditutup, digantikan dengan versi baharu, lalu dibuka semula bersama dokumen yang dibuka tadi.',
  },
  he: {
    updTitle: 'עדכון תוכנה',
    updHeadline: 'גרסה חדשה זמינה',
    updDesc: 'עדכון זה כולל שיפורי ביצועים ותיקוני באגים. מומלץ לעדכן עכשיו.',
    updDownload: 'עדכן עכשיו',
    updLater: 'מזער',
    updInstall: 'הפעל מחדש והתקן',
    updDownloading: 'מוריד את העדכון…',
    updFailed: 'ההורדה נכשלה. בדוק את הרשת ונסה שוב.',
    updRetry: 'נסה שוב',
    updManual: 'העדכון האוטומטי נכשל. הורד את הגרסה העדכנית מדף ההורדות והתקן אותה ידנית.',
    updUpToDate: 'הגרסה שלך עדכנית (גרסה {version}).',
    updCheckFailed: 'לא ניתן לבדוק עדכונים. בדקו את הרשת ונסו שוב.',
    updOpenDownload: 'פתח את דף ההורדות',
    updNotesLabel: 'מה חדש',
    updNotesOnGitHub: 'הצג הערות מלאות ב-GitHub',
    updNotesTruncated: 'מוצג רק חלק.',
    updManualMac:
      'מחשב Mac זה לא יכול להתקין את העדכון באופן אוטומטי. הורידו את הגרסה החדשה מדף ההורדות והעבירו אותה לתיקייה "יישומים". אם פתחתם את האפליקציה ישירות מתמונת הדיסק, העבירו אותה ל"יישומים" והעדכונים הבאים יותקנו מעצמם.',
    updInstallFailed:
      'העדכון האחרון לא הותקן. הפעם תוכנית ההתקנה תיפתח בחלון משלה כדי שתוכלו לראות את ההתקדמות.',
    updVisibleInstall:
      'לאחר ההפעלה מחדש יופיע חלון שמציג את התקדמות ההתקנה. אם Windows מבקש אישור מנהל, בחרו "כן". בסיום, האפליקציה והמסמכים שהיו פתוחים ייפתחו שוב.',
    updRestartNote:
      'לאחר ההפעלה מחדש יופיע חלון שמציג את התקדמות ההתקנה. בסיום, האפליקציה והמסמכים שהיו פתוחים ייפתחו שוב.',
    updRestartNoteMac: 'האפליקציה תיסגר, תוחלף בגרסה החדשה ותיפתח שוב יחד עם המסמכים שהיו פתוחים.',
  },
  hi: {
    updTitle: 'सॉफ़्टवेयर अपडेट',
    updHeadline: 'नया संस्करण उपलब्ध है',
    updDesc:
      'इस अपडेट में प्रदर्शन सुधार और बग फ़िक्स शामिल हैं। हम अभी अपडेट करने की सलाह देते हैं।',
    updDownload: 'अभी अपडेट करें',
    updLater: 'छोटा करें',
    updInstall: 'पुनरारंभ करें और इंस्टॉल करें',
    updDownloading: 'अपडेट डाउनलोड हो रहा है…',
    updFailed: 'डाउनलोड विफल रहा। अपना नेटवर्क जाँचें और पुनः प्रयास करें।',
    updRetry: 'पुनः प्रयास करें',
    updManual:
      'स्वचालित अपडेट विफल रहा। कृपया डाउनलोड पृष्ठ से नवीनतम संस्करण प्राप्त करें और मैन्युअल रूप से इंस्टॉल करें।',
    updUpToDate: 'आप अपडेटेड हैं (संस्करण {version}).',
    updCheckFailed: 'अपडेट जांच नहीं हो सकी। अपना नेटवर्क जांचें और फिर से प्रयास करें।',
    updOpenDownload: 'डाउनलोड पृष्ठ खोलें',
    updNotesLabel: 'नया क्या है',
    updNotesOnGitHub: 'GitHub पर पूरी जानकारी देखें',
    updNotesTruncated: 'केवल एक भाग दिखाया गया है।',
    updManualMac:
      'यह Mac अपडेट अपने आप इंस्टॉल नहीं कर सकता। डाउनलोड पृष्ठ से नया संस्करण लेकर Applications फ़ोल्डर में रखें। अगर आपने ऐप सीधे डिस्क इमेज से खोला था, तो उसे Applications फ़ोल्डर में ले जाएँ; उसके बाद के अपडेट अपने आप इंस्टॉल होंगे।',
    updInstallFailed:
      'पिछला अपडेट इंस्टॉल नहीं हुआ। इस बार इंस्टॉलर अपनी अलग विंडो में खुलेगा, ताकि आप उसकी प्रगति देख सकें।',
    updVisibleInstall:
      'पुनरारंभ के बाद एक विंडो इंस्टॉलेशन की प्रगति दिखाएगी। अगर Windows व्यवस्थापक की अनुमति माँगे, तो हाँ चुनें। पूरा होने पर ऐप और खुले हुए दस्तावेज़ फिर से खुल जाएँगे।',
    updRestartNote:
      'पुनरारंभ के बाद एक विंडो इंस्टॉलेशन की प्रगति दिखाएगी। पूरा होने पर ऐप और खुले हुए दस्तावेज़ फिर से खुल जाएँगे।',
    updRestartNoteMac:
      'ऐप बंद होगा, नए संस्करण से बदला जाएगा और फिर से खुलेगा, साथ में आपके खुले दस्तावेज़ भी।',
  },
  'zh-TW': {
    updTitle: '軟體更新',
    updHeadline: '發現新版本',
    updDesc: '新版本包含效能改進與問題修復，建議立即更新。',
    updDownload: '立即更新',
    updLater: '最小化',
    updInstall: '立即重新啟動安裝',
    updDownloading: '正在下載更新…',
    updFailed: '更新下載失敗，請檢查網路後重試。',
    updRetry: '重試',
    updManual: '自動更新失敗，請從下載頁面取得最新版本並手動安裝。',
    updUpToDate: '已是最新版本（{version}）。',
    updCheckFailed: '無法檢查更新，請檢查網路後重試。',
    updOpenDownload: '前往下載頁面',
    updNotesLabel: '更新內容',
    updNotesOnGitHub: '在 GitHub 查看完整說明',
    updNotesTruncated: '僅顯示部分內容。',
    updManualMac:
      '這台 Mac 無法自動安裝更新。請從下載頁面取得新版本並放入「應用程式」資料夾。如果你是直接從磁碟映像檔開啟 App，請將它移到「應用程式」資料夾，之後的更新就會自動安裝。',
    updInstallFailed: '上次更新未能安裝。這次將以視窗方式開啟安裝程式，方便查看安裝進度。',
    updVisibleInstall:
      '重新啟動後將顯示安裝進度視窗。如果 Windows 要求系統管理員授權，請選擇「是」。安裝完成後，應用程式和先前開啟的文件會重新開啟。',
    updRestartNote:
      '重新啟動後將顯示安裝進度視窗。安裝完成後，應用程式和先前開啟的文件會重新開啟。',
    updRestartNoteMac: 'App 會關閉、換成新版本後重新開啟，先前開啟的文件也會重新開啟。',
  },
})

const FIRST_CHECK_DELAY_MS = 15_000
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

// After this many failed download/apply attempts for the same version the
// dialog stops offering "retry" and guides the user to a manual download
// instead. Covers permanently broken update paths — most importantly a
// code-signing identity (Apple Team ID) change, which Squirrel.Mac rejects
// on every retry while the error looks like a download failure to the user.
const MANUAL_FALLBACK_AFTER = 2
// Where a manual install starts: the repository's own release pages, never a
// URL taken from remotely fetched update metadata. "Latest" is GitHub's newest
// full release, so a pre-release (beta channel) gets its own page instead.
function manualDownloadUrlFor(version: string | null): string {
  return version !== null && version.includes('-')
    ? githubReleaseTagUrl(version)
    : GITHUB_LATEST_RELEASE_URL
}

// electron-updater error codes that mean "the repository has nothing to offer
// this install" rather than "the check could not run": an empty release list
// (ERR_XML_MISSED_ELEMENT — what GitHub serves before the first release), no
// full release for "latest" to resolve to, a release without this platform's
// feed file, or a 404 for the list itself.
const NO_RELEASE_ERROR_CODES = new Set([
  'ERR_XML_MISSED_ELEMENT',
  'ERR_UPDATER_NO_PUBLISHED_VERSIONS',
  'ERR_UPDATER_INVALID_RELEASE_FEED',
  'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
  'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
  'HTTP_ERROR_404',
])

function isNoReleaseError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && NO_RELEASE_ERROR_CODES.has(code)
}

let started = false
// version the user declined this session — don't nag again until next launch
let dismissedVersion: string | null = null
// re-shows the GENOFFICE_FAKE_UPDATE window so the manual check is
// exercisable in dev runs too
let fakeShowAgain: (() => void) | null = null
let manualCheckInFlight = false
// set by initAutoUpdater; drops the download state of the channel being left
let resetDownloadFlow: (() => void) | null = null

// electron-updater feed name per user-facing channel. The platform suffix is
// appended by electron-updater itself: 'beta' resolves to beta.yml on
// Windows, beta-mac.yml on macOS, beta-linux.yml on Linux x64. On GitHub the
// beta channel is the repository's pre-releases (see selectChannel); a
// release there carries latest.yml whatever its version, and the provider
// falls back to that file when the release has no beta.yml.
const CHANNEL_FEED: Record<UpdateChannel, string> = { stable: 'latest', beta: 'beta' }

// true once the packaged-run updater is configured; channel switches before
// that (or in dev runs) must not touch electron-updater
let updaterActive = false

// the update record in the data folder, once the packaged updater is set up
let updateLog: UpdateLogger | null = null

function log(...args: unknown[]): void {
  console.log('[updater]', ...args)
  updateLog?.info(args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' '))
}

function uiStrings(): UpdateUiStrings {
  const lang = getUiLang()
  return {
    title: tUpd(lang, 'updTitle'),
    headline: tUpd(lang, 'updHeadline'),
    desc: tUpd(lang, 'updDesc'),
    download: tUpd(lang, 'updDownload'),
    later: tUpd(lang, 'updLater'),
    install: tUpd(lang, 'updInstall'),
    downloading: tUpd(lang, 'updDownloading'),
    failed: tUpd(lang, 'updFailed'),
    retry: tUpd(lang, 'updRetry'),
    manualDesc: tUpd(lang, process.platform === 'darwin' ? 'updManualMac' : 'updManual'),
    installFailedDesc: tUpd(lang, 'updInstallFailed'),
    visibleInstallDesc: tUpd(lang, 'updVisibleInstall'),
    // Windows hands over to an installer window, macOS to the swap
    // (mac-update.ts); both reopen the app
    restartDesc:
      process.platform === 'win32'
        ? tUpd(lang, 'updRestartNote')
        : process.platform === 'darwin'
          ? tUpd(lang, 'updRestartNoteMac')
          : '',
    openDownload: tUpd(lang, 'updOpenDownload'),
    notesLabel: tUpd(lang, 'updNotesLabel'),
    notesOnGitHub: tUpd(lang, 'updNotesOnGitHub'),
    notesTruncated: tUpd(lang, 'updNotesTruncated'),
  }
}

function initialState(
  version: string,
  releaseNotes: UpdateReleaseNotes | null = null,
  visibleInstall = false,
): UpdateUiState {
  return {
    phase: 'available',
    version,
    currentVersion: app.getVersion(),
    percent: 0,
    lang: htmlLang(getUiLang()),
    strings: uiStrings(),
    releaseNotes,
    visibleInstall,
  }
}

function selectChannel(channel: UpdateChannel): void {
  autoUpdater.channel = CHANNEL_FEED[channel]
  // the channel setter unconditionally flips allowDowngrade to true; force it
  // back off since a beta user switching to stable must not downgrade
  autoUpdater.allowDowngrade = false
  // The GitHub provider resolves stable to the repository's "latest" release,
  // which is never a pre-release, and only looks at pre-releases when this is
  // on. Set both ways: electron-updater turns it on by itself whenever the
  // installed version is a pre-release.
  autoUpdater.allowPrerelease = channel === 'beta'
}

export function applyUpdateChannel(channel: UpdateChannel): void {
  if (!updaterActive) return
  resetDownloadFlow?.()
  selectChannel(channel)
  log('channel switched:', channel)
  autoUpdater.checkForUpdates().catch((err) => log('check failed:', err?.message ?? err))
}

/** User-triggered check (☰ > Check for Updates…, Help on macOS, or the About
 * dialog button).
 * Unlike the silent launch/periodic checks, every outcome gets explicit
 * feedback: an available update opens the standard update window (even a
 * version dismissed with "later" this session — the user just asked for it),
 * up-to-date and failure each get a dialog (a repository with no release to
 * offer counts as up-to-date, not as a failure), and installs with no
 * self-update mechanism (dev runs, Linux .deb) are pointed at the download
 * page instead of being told they're current. */
export async function checkForUpdatesNow(): Promise<void> {
  if (manualCheckInFlight) return
  manualCheckInFlight = true
  try {
    const lang = getUiLang()
    if (fakeShowAgain) {
      fakeShowAgain()
      return
    }
    if (!updaterActive) {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: tUpd(lang, 'updTitle'),
        message: tUpd(lang, 'updManual'),
        buttons: ['OK', tUpd(lang, 'updOpenDownload')],
        defaultId: 0,
        cancelId: 0,
      })
      if (response === 1) void shell.openExternal(GITHUB_LATEST_RELEASE_URL)
      return
    }
    dismissedVersion = null
    let result
    try {
      result = await autoUpdater.checkForUpdates()
      if (result === null) throw new Error('Update check was skipped')
    } catch (err) {
      log('manual check failed:', (err as Error)?.message ?? err)
      if (!isNoReleaseError(err)) {
        await dialog.showMessageBox({
          type: 'warning',
          title: tUpd(lang, 'updTitle'),
          message: tUpd(lang, 'updCheckFailed'),
          buttons: ['OK'],
          defaultId: 0,
          cancelId: 0,
        })
        return
      }
    }
    // an available update already opened the update window via the
    // 'update-available' handler; only "nothing new" needs a dialog here
    if (result?.isUpdateAvailable) return
    await dialog.showMessageBox({
      type: 'info',
      title: tUpd(lang, 'updTitle'),
      message: tUpd(lang, 'updUpToDate', { version: app.getVersion() }),
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
    })
  } finally {
    manualCheckInFlight = false
  }
}

export function initAutoUpdater(
  getWindow: () => BrowserWindow | null,
  initialChannel: UpdateChannel = 'stable',
  /** Settings › "Check for updates automatically"; read at every background check (genoffice#2127) */
  autoCheckEnabled: () => boolean = () => true,
): void {
  if (started) return
  started = true
  setUpdateParentWindow(getWindow)

  // dev preview of the update window with a simulated download
  if (!app.isPackaged && process.env.GENOFFICE_FAKE_UPDATE) {
    initFakeUpdate(getWindow, process.env.GENOFFICE_FAKE_UPDATE)
    return
  }
  // Unpacked runs have no app-update.yml and must not ask GitHub with a
  // dev version. Windows updates via NSIS (latest.yml), macOS via the zip
  // target + latest-mac.yml (installed by mac-update.ts, not Squirrel.Mac —
  // dmg is first-install only), Linux via the AppImage target +
  // latest-linux.yml. On Linux the updater only works for AppImage runs
  // (electron-updater's AppImageUpdater needs the APPIMAGE env var the
  // AppImage runtime sets); deb installs update manually via apt.
  if (!app.isPackaged) return
  const isLinuxAppImage = process.platform === 'linux' && Boolean(process.env.APPIMAGE)
  if (process.platform !== 'win32' && process.platform !== 'darwin' && !isLinuxAppImage) return

  updaterActive = true
  const dataDir = app.getPath('userData')
  const record = createUpdateLog(join(dataDir, UPDATE_LOG_FILE))
  updateLog = record
  autoUpdater.logger = record
  // the installer passes --updated when it reopens the app after an update;
  // without it this launch was the user's own
  const launchedBy = reopenedByInstaller() ? ', reopened by the installer' : ''
  log('running', app.getVersion(), 'on the', initialChannel, `channel${launchedBy}`)
  selectChannel(initialChannel)
  autoUpdater.autoDownload = false
  // The window shows what changed before the user starts the download
  // (docs/plans/update-details.md). The full changelog collects the bodies of
  // every release newer than this install from the feed request the GitHub
  // provider already makes — no extra network call.
  autoUpdater.fullChangelog = true
  // The installer is started here at will-quit (startInstaller below), never
  // by electron-updater's own quit hook: the quit is certain by then, so the
  // installer cannot close the app over a save prompt, and every start is
  // recorded for the next launch to check.
  autoUpdater.autoInstallOnAppQuit = false
  // full-package policy: never attempt blockmap differential downloads
  // (a release then needs only the installer and its latest.yml)
  autoUpdater.disableDifferentialDownload = true
  installResumeDownload(autoUpdater as unknown as Parameters<typeof installResumeDownload>[0])

  // macOS: Squirrel.Mac only installs into an app signed with a Developer ID,
  // which this product's Mac builds do not have (decision 0031). The app
  // installs the downloaded zip itself (mac-update.ts, decision 0097); an
  // install that cannot replace itself keeps the download page.
  const isMac = process.platform === 'darwin'
  const macBundle = isMac ? macAppBundle(process.execPath) : null
  // the unpacked new version, once a download for it has been checked
  let macStaged: { version: string; app: string } | null = null
  let selfUpdates = true
  if (isMac) {
    const block = macSelfUpdateBlock(process.execPath)
    if (macBundle !== null && block === null) removeMacLeftovers(macBundle)
    const staging =
      macBundle !== null &&
      block === null &&
      installMacStaging(autoUpdater, async (zip, version) => {
        macStaged = null
        log('unpacking', version, 'beside', macBundle)
        const stagedApp = await stageMacUpdate({ zip, bundle: macBundle, version })
        macStaged = { version, app: stagedApp }
        log('unpacked and checked', version)
      })
    selfUpdates = staging
    if (!staging) log('this Mac install cannot update itself:', block ?? 'no staging hook')
  }

  let latestSeenVersion: string | null = null
  // release notes of latestSeenVersion, converted once when the version lands
  let latestSeenNotes: UpdateReleaseNotes | null = null
  // consecutive failed attempts for latestSeenVersion; a download can fail
  // through the downloadUpdate() rejection OR only through the 'error' event
  // (macOS: Squirrel.Mac reports signature/apply failures natively), so both
  // paths funnel into failDownload() and the in-flight flag dedupes them
  let failedAttempts = 0
  let downloadInFlight = false
  // where latestSeenVersion got to, so re-opening the window for the same
  // version (a manual check after "later") resumes there instead of offering
  // "Update Now" over a download that is running or already finished
  let phase: UpdatePhase = 'available'
  let percent = 0
  // the running download's token plus a generation stamp, so a channel switch
  // can cancel the request and its late rejection cannot fail the next one
  let downloadToken: CancellationToken | null = null
  let downloadGen = 0

  // An installer start that left the app at the old version is reported and
  // gets one more try; a second one that failed goes to the download page
  // (update-attempt.ts). A record with nothing left to say goes.
  const previousAttempt = readInstallAttempt(dataDir)
  const failedInstall = installDidNotApply(previousAttempt, app.getVersion())
    ? previousAttempt
    : null
  const installFailures: InstallFailureLevel = installFailureLevel(failedInstall)
  if (failedInstall) {
    log(
      'the installer started for',
      failedInstall.version,
      failedInstall.visible ? 'in its own window' : 'silently',
      'did not update',
      app.getVersion(),
    )
  } else if (previousAttempt) {
    log('the installer started for', previousAttempt.version, 'has run; now', app.getVersion())
    clearInstallAttempt(dataDir)
  }

  // An "all users" install needs administrator rights, so its installer window
  // will ask for them; the update window says so before the restart. Checked once.
  let installDirOk: boolean | null = null
  const adminPromptExpected = (): boolean => {
    if (process.platform !== 'win32') return false
    installDirOk ??= installDirWritable(
      dirname(process.execPath),
      `.ieumoffice-update-check-${process.pid}`,
    )
    return !installDirOk
  }

  // macOS: the swap starts once the app's process is gone and reopens the
  // app, the new version when it worked. The next launch reads the record
  // like it does after the Windows installer.
  const startMacSwapFor = (version: string): void => {
    if (macBundle === null || macStaged === null || macStaged.version !== version) {
      log('no unpacked update for', version, 'to install')
      return
    }
    const tries = nextAttemptTries(failedInstall, version)
    recordInstallAttempt(dataDir, { version, fromVersion: app.getVersion(), visible: false, tries })
    log('replacing the app with', version, 'once it has quit, try', String(tries))
    const started = startMacSwap({
      pid: process.pid,
      bundle: macBundle,
      staged: macStaged.app,
      logFile: join(dataDir, UPDATE_LOG_FILE),
    })
    if (!started) log('the swap did not start')
  }

  const startInstaller = (version: string): void => {
    // Windows: the installer's own window, progress page only, which reopens
    // the app at the end (build/installer.nsh). A silent install left the user
    // a minute or more of nothing, long enough to start the app again into
    // the files being replaced (decision 0077).
    const visible = process.platform === 'win32'
    const tries = nextAttemptTries(failedInstall, version)
    recordInstallAttempt(dataDir, { version, fromVersion: app.getVersion(), visible, tries })
    log(
      'starting the installer for',
      version,
      visible ? 'in its own window' : 'silently',
      'to reopen the app, try',
      String(tries),
    )
    // BaseUpdater.install: the same call electron-updater's quit hook makes;
    // it spawns the installer detached and returns at once
    const updater = autoUpdater as unknown as {
      install?: (isSilent: boolean, isForceRunAfter: boolean) => boolean
    }
    if (typeof updater.install !== 'function' || !updater.install(!visible, true)) {
      log('the installer did not start')
    }
  }

  // will-quit comes only once every window has closed and no save prompt was
  // cancelled: the right moment to hand over to the installer. Only "Restart &
  // Install" installs. An ordinary quit never does: the user would not know an
  // install is running and could open the app into it (decision 0077).
  app.on('will-quit', () => {
    if (!selfUpdates || phase !== 'downloaded' || latestSeenVersion === null) return
    if (!updateRestartRequested()) return
    if (isMac) startMacSwapFor(latestSeenVersion)
    else startInstaller(latestSeenVersion)
  })

  const setPhase = (patch: {
    phase: UpdatePhase
    percent?: number
    visibleInstall?: boolean
  }): void => {
    phase = patch.phase
    if (patch.percent !== undefined) percent = patch.percent
    pushUpdateState(patch)
  }

  /** the window state for `version` at the current phase */
  const windowState = (version: string): UpdateUiState => ({
    ...initialState(version, latestSeenNotes, phase === 'downloaded' && adminPromptExpected()),
    phase,
    percent,
  })

  const failDownload = (): void => {
    if (!downloadInFlight) return
    downloadInFlight = false
    failedAttempts += 1
    setPhase({ phase: failedAttempts >= MANUAL_FALLBACK_AFTER ? 'manual' : 'error' })
  }

  // electron-updater cannot discard a finished download, so a package from
  // the previous channel is made stale instead: it is never installed (not on
  // quit, not via the window) and the next channel's update-available starts
  // the flow over from 'available'
  resetDownloadFlow = () => {
    if (latestSeenVersion === null) return
    log('channel switch: dropping', latestSeenVersion, 'in phase', phase)
    downloadToken?.cancel()
    downloadToken = null
    downloadGen += 1
    latestSeenVersion = null
    latestSeenNotes = null
    macStaged = null
    failedAttempts = 0
    downloadInFlight = false
    phase = 'available'
    percent = 0
    clearUpdateState()
  }

  const actions = {
    onDownload: () => {
      if (phase === 'downloading' || phase === 'downloaded') return
      if (!selfUpdates) {
        void shell.openExternal(manualDownloadUrlFor(latestSeenVersion))
        return
      }
      downloadInFlight = true
      setPhase({ phase: 'downloading', percent: 0 })
      const gen = ++downloadGen
      downloadToken = new CancellationToken()
      autoUpdater.downloadUpdate(downloadToken).catch((err) => {
        if (gen !== downloadGen) return
        log('download failed:', err?.message ?? err)
        failDownload()
      })
    },
    onInstall: () => {
      closeUpdateWindow()
      if (latestSeenVersion === null || phase !== 'downloaded') return
      log('restart requested to install', latestSeenVersion)
      requestUpdateRestart()
      // let the window fully close before tearing the app down; the installer
      // starts at will-quit, after every save prompt has been answered
      setImmediate(() => app.quit())
    },
    onLater: () => {
      dismissedVersion = latestSeenVersion
      closeUpdateWindow()
    },
    onOpenDownload: () => {
      void shell.openExternal(manualDownloadUrlFor(latestSeenVersion))
    },
  }

  autoUpdater.on('error', (err) => {
    // network failures during background checks are expected; only surface
    // when the user is watching a download
    log('error:', err?.message ?? err)
    failDownload()
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    if (info.version === dismissedVersion) return
    const sameVersionRecheck = info.version === latestSeenVersion
    // progress/downloaded/error events carry no version, so a newer release
    // landing while the previous one is downloading or already downloaded
    // stays out until that flow ends (it installs on quit and the next launch
    // picks up the newer one); it must not hijack the open window
    if (!sameVersionRecheck && (downloadInFlight || phase === 'downloaded')) {
      log('update available:', info.version, 'ignored while', latestSeenVersion, 'is', phase)
      // an explicit check still owes feedback: bring back the flow in progress
      // (a background recheck stays quiet)
      if (manualCheckInFlight && !isUpdateWindowOpen()) {
        showUpdateWindow(getWindow(), windowState(latestSeenVersion ?? info.version), actions)
      }
      return
    }
    if (!sameVersionRecheck) {
      failedAttempts = 0
      // a Mac swap that did not take is not retried: nothing about it would
      // change on a second try (the install-failed wording is the Windows
      // installer's)
      phase =
        !selfUpdates || installFailures >= 2 || (isMac && installFailures >= 1)
          ? 'manual'
          : installFailures === 1
            ? 'install-failed'
            : 'available'
      percent = 0
      latestSeenNotes = normalizeReleaseNotes(info.releaseNotes)
    } else {
      // a repeated event for the same version (periodic recheck) refreshes
      // the notes only when the feed carried some — never wipe already known
      // notes with a notes-less repeat
      latestSeenNotes = normalizeReleaseNotes(info.releaseNotes) ?? latestSeenNotes
    }
    latestSeenVersion = info.version
    log('update available:', info.version)
    // a periodic recheck resolving to the version the open dialog already
    // shows must not reset its phase to 'available' — that would wipe an
    // in-progress download or a terminal 'manual' fallback back to the
    // "Update Now" offer
    if (sameVersionRecheck && isUpdateWindowOpen()) return
    showUpdateWindow(getWindow(), windowState(info.version), actions)
  })

  autoUpdater.on('download-progress', (progress) => {
    if (!downloadInFlight) return
    setPhase({ phase: 'downloading', percent: progress.percent })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    if (info.version !== latestSeenVersion) {
      log('downloaded:', info.version, 'ignored (stale after channel switch)')
      return
    }
    log('downloaded:', info.version)
    downloadInFlight = false
    failedAttempts = 0
    setPhase({ phase: 'downloaded', percent: 100, visibleInstall: adminPromptExpected() })
    // A download finished behind a minimized window would otherwise wait,
    // unseen, in Settings > About: bring "Restart & Install" back, without
    // taking the focus from whatever the user is typing in.
    if (!isUpdateWindowOpen()) {
      showUpdateWindow(getWindow(), windowState(info.version), actions, { inactive: true })
    }
  })

  const check = (): void => {
    // turned off: only an explicit check (Help › Check for Updates…, a channel switch) asks the feed
    if (!autoCheckEnabled()) return
    autoUpdater.checkForUpdates().catch((err) => log('check failed:', err?.message ?? err))
  }
  setTimeout(check, FIRST_CHECK_DELAY_MS)
  setInterval(check, RECHECK_INTERVAL_MS)
}

/** unpacked-run simulation: real window + IPC, fake download that completes */
function initFakeUpdate(getWindow: () => BrowserWindow | null, version: string): void {
  let timer: NodeJS.Timeout | null = null
  const actions = {
    onDownload: () => {
      let pct = 0
      pushUpdateState({ phase: 'downloading', percent: 0 })
      timer = setInterval(() => {
        pct += 4
        if (pct >= 100) {
          if (timer) clearInterval(timer)
          pushUpdateState({ phase: 'downloaded', percent: 100 })
        } else {
          pushUpdateState({ phase: 'downloading', percent: pct })
        }
      }, 100)
    },
    onInstall: () => {
      log('[fake] install requested')
      closeUpdateWindow()
    },
    onLater: () => {
      if (timer) clearInterval(timer)
      closeUpdateWindow()
    },
    onOpenDownload: () => {
      log('[fake] open download page requested')
    },
  }
  // two sections show the skipped-versions layout (per-version headings)
  const notes = normalizeReleaseNotes([
    {
      version,
      note: `<p>A simulated update for the preview.</p>
<h2>What's new</h2>
<ul>
<li><strong>Update notes</strong>: the window shows what changed before you update.</li>
<li><code>GENOFFICE_FAKE_UPDATE</code> opens this preview.</li>
</ul>`,
    },
    {
      version: '9.9.8',
      note: `<p>Notes of the previous version.</p>
<h2>Fixed</h2>
<ul>
<li>One older fix, shown when versions were skipped.</li>
</ul>`,
    },
  ])
  fakeShowAgain = () => showUpdateWindow(getWindow(), initialState(version, notes), actions)
  setTimeout(() => fakeShowAgain?.(), 1500)
}
