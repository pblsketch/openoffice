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
  readInstallAttempt,
  recordInstallAttempt,
} from './update-attempt'
import type { InstallFailureLevel } from './update-attempt'
import { createUpdateLog, UPDATE_LOG_FILE } from './update-log'
import type { UpdateLogger } from './update-log'
import { requestUpdateRestart, updateRestartRequested } from './update-restart'
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
 * reads the zip target's latest-mac.yml but is only pointed at the release
 * page (see SELF_UPDATES); Linux through the AppImage
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
    updManualMac: 'Mac 版无法自动更新。请从下载页面获取新版本并安装。',
    updInstallFailed: '上次更新未能安装。这次将以窗口方式打开安装程序，以便查看安装进度。',
    updVisibleInstall: '重启后将打开安装程序窗口。如果 Windows 请求管理员授权，请选择“是”。',
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
      "The Mac version can't update itself. Download the new version from the download page and install it.",
    updInstallFailed:
      'The last update did not install. This time the installer opens in its own window so you can see its progress.',
    updVisibleInstall:
      'After the restart the installer opens in its own window. If Windows asks for administrator approval, choose Yes.',
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
      'Phiên bản Mac không thể tự cập nhật. Hãy tải phiên bản mới từ trang tải xuống và cài đặt.',
    updInstallFailed:
      'Bản cập nhật lần trước chưa được cài đặt. Lần này trình cài đặt sẽ mở trong cửa sổ riêng để bạn theo dõi tiến trình.',
    updVisibleInstall:
      'Sau khi khởi động lại, trình cài đặt sẽ mở trong cửa sổ riêng. Nếu Windows yêu cầu quyền quản trị viên, hãy chọn Có.',
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
      'Mac 版は自動で更新できません。ダウンロードページから新しいバージョンを入手してインストールしてください。',
    updInstallFailed:
      '前回のアップデートはインストールされませんでした。今回はインストーラーをウィンドウで開き、進行状況を表示します。',
    updVisibleInstall:
      '再起動するとインストーラーのウィンドウが開きます。Windows が管理者の承認を求めたら「はい」を選んでください。',
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
      'Mac용 설치본은 스스로 업데이트하지 못합니다. 다운로드 페이지에서 새 버전을 받아 설치해 주세요.',
    updInstallFailed:
      '지난번 업데이트가 설치되지 않았습니다. 이번에는 설치 프로그램을 창으로 띄워 진행 상황을 보여 드립니다.',
    updVisibleInstall:
      "다시 시작하면 설치 프로그램 창이 뜹니다. 관리자 승인을 묻는 창이 나오면 '예'를 눌러 주세요.",
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
      "La version Mac ne peut pas se mettre à jour d'elle-même. Téléchargez la nouvelle version depuis la page de téléchargement et installez-la.",
    updInstallFailed:
      "La dernière mise à jour ne s'est pas installée. Cette fois, le programme d'installation s'ouvre dans sa propre fenêtre pour que vous puissiez suivre sa progression.",
    updVisibleInstall:
      "Après le redémarrage, le programme d'installation s'ouvre dans sa propre fenêtre. Si Windows demande l'autorisation d'un administrateur, choisissez Oui.",
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
      'Die Mac-Version kann sich nicht selbst aktualisieren. Laden Sie die neue Version von der Download-Seite herunter und installieren Sie sie.',
    updInstallFailed:
      'Das letzte Update wurde nicht installiert. Diesmal öffnet sich das Installationsprogramm in einem eigenen Fenster, damit Sie den Fortschritt sehen.',
    updVisibleInstall:
      'Nach dem Neustart öffnet sich das Installationsprogramm in einem eigenen Fenster. Wenn Windows nach Administratorrechten fragt, wählen Sie „Ja“.',
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
      'La versión para Mac no puede actualizarse sola. Descarga la nueva versión desde la página de descargas e instálala.',
    updInstallFailed:
      'La última actualización no se instaló. Esta vez el instalador se abre en su propia ventana para que pueda ver su progreso.',
    updVisibleInstall:
      'Tras el reinicio, el instalador se abre en su propia ventana. Si Windows pide la aprobación de un administrador, elija Sí.',
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
      'เวอร์ชัน Mac ไม่สามารถอัปเดตตัวเองได้ โปรดดาวน์โหลดเวอร์ชันใหม่จากหน้าดาวน์โหลดแล้วติดตั้ง',
    updInstallFailed:
      'การอัปเดตครั้งก่อนไม่ได้ติดตั้ง ครั้งนี้ตัวติดตั้งจะเปิดในหน้าต่างของตัวเองเพื่อให้คุณเห็นความคืบหน้า',
    updVisibleInstall:
      'หลังรีสตาร์ท ตัวติดตั้งจะเปิดในหน้าต่างของตัวเอง หาก Windows ขอการอนุมัติจากผู้ดูแลระบบ ให้เลือก ใช่',
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
      'Versi Mac tidak dapat memperbarui dirinya sendiri. Unduh versi baru dari halaman unduhan lalu instal.',
    updInstallFailed:
      'Pembaruan terakhir tidak terpasang. Kali ini penginstal dibuka di jendelanya sendiri agar Anda dapat melihat kemajuannya.',
    updVisibleInstall:
      'Setelah dimulai ulang, penginstal terbuka di jendelanya sendiri. Jika Windows meminta persetujuan administrator, pilih Ya.',
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
      'Версия для Mac не обновляется автоматически. Скачайте новую версию со страницы загрузки и установите её.',
    updInstallFailed:
      'Последнее обновление не установилось. На этот раз установщик откроется в отдельном окне, чтобы вы видели ход установки.',
    updVisibleInstall:
      'После перезапуска установщик откроется в отдельном окне. Если Windows запросит разрешение администратора, выберите «Да».',
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
    updManualMac: 'لا يمكن لإصدار Mac تحديث نفسه. نزّل الإصدار الجديد من صفحة التنزيل وثبّته.',
    updInstallFailed:
      'لم يتم تثبيت التحديث الأخير. هذه المرة سيفتح برنامج التثبيت في نافذته الخاصة لتتمكن من متابعة التقدم.',
    updVisibleInstall:
      'بعد إعادة التشغيل يفتح برنامج التثبيت في نافذته الخاصة. إذا طلب Windows موافقة المسؤول، فاختر نعم.',
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
      'A versão para Mac não consegue se atualizar sozinha. Baixe a nova versão na página de download e instale-a.',
    updInstallFailed:
      'A última atualização não foi instalada. Desta vez o instalador abre em sua própria janela para você acompanhar o progresso.',
    updVisibleInstall:
      'Após reiniciar, o instalador abre em sua própria janela. Se o Windows pedir aprovação de administrador, escolha Sim.',
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
      'La versione per Mac non può aggiornarsi da sola. Scarica la nuova versione dalla pagina di download e installala.',
    updInstallFailed:
      "L'ultimo aggiornamento non è stato installato. Questa volta il programma di installazione si apre in una finestra propria, così puoi seguirne l'avanzamento.",
    updVisibleInstall:
      "Dopo il riavvio il programma di installazione si apre in una finestra propria. Se Windows chiede l'approvazione di un amministratore, scegli Sì.",
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
      'Wersja na Maca nie może zaktualizować się sama. Pobierz nową wersję ze strony pobierania i zainstaluj ją.',
    updInstallFailed:
      'Ostatnia aktualizacja nie została zainstalowana. Tym razem instalator otworzy się we własnym oknie, aby można było śledzić postęp.',
    updVisibleInstall:
      'Po ponownym uruchomieniu instalator otworzy się we własnym oknie. Jeśli system Windows poprosi o zgodę administratora, wybierz Tak.',
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
      'Verze pro Mac se nedokáže aktualizovat sama. Stáhněte novou verzi ze stránky pro stažení a nainstalujte ji.',
    updInstallFailed:
      'Poslední aktualizace se nenainstalovala. Tentokrát se instalátor otevře ve vlastním okně, abyste viděli průběh.',
    updVisibleInstall:
      'Po restartu se instalátor otevře ve vlastním okně. Pokud Windows požádá o souhlas správce, zvolte Ano.',
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
      'De Mac-versie kan zichzelf niet bijwerken. Download de nieuwe versie van de downloadpagina en installeer die.',
    updInstallFailed:
      'De laatste update is niet geïnstalleerd. Deze keer opent het installatieprogramma in een eigen venster, zodat u de voortgang ziet.',
    updVisibleInstall:
      'Na het herstarten opent het installatieprogramma in een eigen venster. Als Windows om toestemming van een beheerder vraagt, kiest u Ja.',
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
      'Versi Mac tidak dapat mengemas kini dirinya sendiri. Muat turun versi baharu dari halaman muat turun dan pasangnya.',
    updInstallFailed:
      'Kemas kini terakhir tidak dipasang. Kali ini pemasang dibuka dalam tetingkapnya sendiri supaya anda dapat melihat kemajuannya.',
    updVisibleInstall:
      'Selepas dimulakan semula, pemasang dibuka dalam tetingkapnya sendiri. Jika Windows meminta kelulusan pentadbir, pilih Ya.',
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
    updManualMac: 'גרסת ה-Mac לא יכולה להתעדכן בעצמה. הורד את הגרסה החדשה מדף ההורדות והתקן אותה.',
    updInstallFailed:
      'העדכון האחרון לא הותקן. הפעם תוכנית ההתקנה תיפתח בחלון משלה כדי שתוכלו לראות את ההתקדמות.',
    updVisibleInstall:
      'לאחר ההפעלה מחדש תוכנית ההתקנה תיפתח בחלון משלה. אם Windows מבקש אישור מנהל, בחרו "כן".',
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
      'Mac संस्करण अपने आप अपडेट नहीं हो सकता। डाउनलोड पृष्ठ से नया संस्करण लेकर इंस्टॉल करें।',
    updInstallFailed:
      'पिछला अपडेट इंस्टॉल नहीं हुआ। इस बार इंस्टॉलर अपनी अलग विंडो में खुलेगा, ताकि आप उसकी प्रगति देख सकें।',
    updVisibleInstall:
      'पुनरारंभ के बाद इंस्टॉलर अपनी अलग विंडो में खुलेगा। अगर Windows व्यवस्थापक की अनुमति माँगे, तो हाँ चुनें।',
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
    updManualMac: 'Mac 版無法自動更新。請從下載頁面取得新版本並安裝。',
    updInstallFailed: '上次更新未能安裝。這次將以視窗方式開啟安裝程式，方便查看安裝進度。',
    updVisibleInstall:
      '重新啟動後將開啟安裝程式視窗。如果 Windows 要求系統管理員授權，請選擇「是」。',
  },
})

// This product's macOS builds are signed ad hoc only (electron-builder.cjs,
// docs/tracking/decisions/0031-unsigned-mac-beta.md), and Squirrel.Mac only
// installs an update into an app signed with a Developer ID. A Mac install
// still checks the feed (latest-mac.yml), but an update it finds goes
// straight to the window's manual phase: the release page, never a download
// that is bound to fail.
const SELF_UPDATES = process.platform !== 'darwin'

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
    manualDesc: tUpd(lang, SELF_UPDATES ? 'updManual' : 'updManualMac'),
    installFailedDesc: tUpd(lang, 'updInstallFailed'),
    visibleInstallDesc: tUpd(lang, 'updVisibleInstall'),
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
  // target + latest-mac.yml (Squirrel.Mac requires a signed, notarized app
  // — dmg is first-install only), Linux via the AppImage target +
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
  log('running', app.getVersion(), 'on the', initialChannel, 'channel')
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

  // A silent install that left the app at the old version gets its next try in
  // the installer's own window; one that failed there too goes to the
  // download page (update-attempt.ts). A record with nothing left to say goes.
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

  // An "all users" install needs administrator rights, so its installer asks
  // for them; started in its own window that prompt comes with the installer
  // instead of out of nowhere after the app has gone. Checked once.
  let installDirOk: boolean | null = null
  const installNeedsWindow = (): boolean => {
    if (installFailures > 0) return true
    if (process.platform !== 'win32') return false
    installDirOk ??= installDirWritable(
      dirname(process.execPath),
      `.ieumoffice-update-check-${process.pid}`,
    )
    return !installDirOk
  }

  const startInstaller = (version: string, restart: boolean): void => {
    const visible = restart && installNeedsWindow()
    recordInstallAttempt(dataDir, { version, fromVersion: app.getVersion(), visible })
    log(
      'starting the installer for',
      version,
      visible ? 'in its own window' : 'silently',
      restart ? 'to reopen the app' : 'on quit',
    )
    // BaseUpdater.install: the same call electron-updater's quit hook makes;
    // it spawns the installer detached and returns at once
    const updater = autoUpdater as unknown as {
      install?: (isSilent: boolean, isForceRunAfter: boolean) => boolean
    }
    if (typeof updater.install !== 'function' || !updater.install(!visible, restart)) {
      log('the installer did not start')
    }
  }

  // will-quit comes only once every window has closed and no save prompt was
  // cancelled: the right moment to hand over to the installer
  app.on('will-quit', () => {
    if (!SELF_UPDATES || phase !== 'downloaded' || latestSeenVersion === null) return
    const restart = updateRestartRequested()
    // "later" after the download installs on quit, unless installing has
    // already failed here: that retry waits for the user, in a window
    if (!restart && installFailures > 0) return
    startInstaller(latestSeenVersion, restart)
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
    ...initialState(version, latestSeenNotes, phase === 'downloaded' && installNeedsWindow()),
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
    failedAttempts = 0
    downloadInFlight = false
    phase = 'available'
    percent = 0
    clearUpdateState()
  }

  const actions = {
    onDownload: () => {
      if (phase === 'downloading' || phase === 'downloaded') return
      if (!SELF_UPDATES) {
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
      phase =
        !SELF_UPDATES || installFailures >= 2
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
    setPhase({ phase: 'downloaded', percent: 100, visibleInstall: installNeedsWindow() })
  })

  const check = (): void => {
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
