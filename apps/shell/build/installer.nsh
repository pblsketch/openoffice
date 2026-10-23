; Keeps the genoffice command line (resources\cli, holding genoffice.cmd and the
; extension-less genoffice for Git Bash) on the installing user's PATH for the
; lifetime of the install. The value is read and written unexpanded
; (REG_EXPAND_SZ) so entries such as %USERPROFILE%\bin survive, and Explorer
; is told about the change so terminals opened afterwards see it.
; electron-builder compiles the script twice (the second pass, with
; BUILD_UNINSTALLER, only produces the uninstaller); an unreferenced function
; in either pass is a warning makensis treats as an error, hence the guards.
!include "WinMessages.nsh"
!include "StrFunc.nsh"

!define GENOFFICE_PATH_MAX 7900

; Scope templates to our ProgIDs (electron-builder uses win.fileAssociations.name).
; A shared .ext\ShellNew would overwrite Office/WPS templates. OOXML files
; must be copied from valid packages, never created with NullFile.
!macro GenOfficeRegisterShellNew EXT PROGID
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\${PROGID}\ShellNew" "FileName" "$INSTDIR\resources\shell-new\blank.${EXT}"
!macroend

!macro GenOfficeUnregisterShellNew EXT PROGID
  ; Only remove our own registration, including when uninstalling for an update.
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.${EXT}\${PROGID}\ShellNew" "FileName"
  ${If} $0 == "$INSTDIR\resources\shell-new\blank.${EXT}"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\.${EXT}\${PROGID}\ShellNew"
    DeleteRegKey /ifempty SHELL_CONTEXT "Software\Classes\.${EXT}\${PROGID}"
  ${EndIf}
!macroend

; .odt is only offered in Explorer's "Open with": a product-own ProgId plus a
; value under .odt\OpenWithProgids. A win.fileAssociations entry would also
; write .odt's default value (APP_ASSOCIATE) and take over the user's ODT
; program, so ODT is registered here instead. ODT opens in the Word tab, so the
; ProgId borrows the Word icon the installer already places for .docx.
!define GENOFFICE_ODT_PROGID "IeumOffice.OpenDocumentText"

!macro GenOfficeRegisterOpenWithOdt
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_ODT_PROGID}" "" "OpenDocument Text"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_ODT_PROGID}\DefaultIcon" "" "$INSTDIR\resources\docx.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_ODT_PROGID}\shell\open\command" "" '"$appExe" "%1"'
  WriteRegNone SHELL_CONTEXT "Software\Classes\.odt\OpenWithProgids" "${GENOFFICE_ODT_PROGID}"
!macroend

!macro GenOfficeUnregisterOpenWithOdt
  ; Only our value and our ProgId: the .odt key, its default value and other
  ; programs' OpenWithProgids entries belong to whoever wrote them.
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.odt\OpenWithProgids" "${GENOFFICE_ODT_PROGID}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${GENOFFICE_ODT_PROGID}"
!macroend

; .hwp, .hwpx, .xmind and .excalidraw are offered in Explorer's "Open with" and
; never made the default, for the same reason as .odt above: a win.fileAssociations
; entry would also write the extension's default value and take it over (from
; Hancom Office for the Hangul formats, from whatever opens the mind map or the
; drawing today). Each
; gets a product-own ProgId whose DefaultIcon is the per-type document icon
; (resources\hwp.ico / mindmap.ico / excalidraw.ico, placed by the win.extraResources
; entries in electron-builder.cjs), so choosing this app in "Open with" shows
; the Hangul or mind-map icon instead of the bare app icon. The ProgIds match
; the name-to-ProgId rule electron-builder.cjs uses for its Windows list
; (see tests/product-identity.test.ts).
!define GENOFFICE_HWP_PROGID "IeumOffice.HWPDocument"
!define GENOFFICE_HWPX_PROGID "IeumOffice.HWPXDocument"
!define GENOFFICE_MINDMAP_PROGID "IeumOffice.MindMap"
!define GENOFFICE_DRAWING_PROGID "IeumOffice.Drawing"

!macro GenOfficeRegisterOpenWithHwp
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_HWP_PROGID}" "" "HWP Document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_HWP_PROGID}\DefaultIcon" "" "$INSTDIR\resources\hwp.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_HWP_PROGID}\shell\open\command" "" '"$appExe" "%1"'
  WriteRegNone SHELL_CONTEXT "Software\Classes\.hwp\OpenWithProgids" "${GENOFFICE_HWP_PROGID}"
!macroend

!macro GenOfficeUnregisterOpenWithHwp
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.hwp\OpenWithProgids" "${GENOFFICE_HWP_PROGID}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${GENOFFICE_HWP_PROGID}"
!macroend

!macro GenOfficeRegisterOpenWithHwpx
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_HWPX_PROGID}" "" "HWPX Document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_HWPX_PROGID}\DefaultIcon" "" "$INSTDIR\resources\hwp.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_HWPX_PROGID}\shell\open\command" "" '"$appExe" "%1"'
  WriteRegNone SHELL_CONTEXT "Software\Classes\.hwpx\OpenWithProgids" "${GENOFFICE_HWPX_PROGID}"
!macroend

!macro GenOfficeUnregisterOpenWithHwpx
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.hwpx\OpenWithProgids" "${GENOFFICE_HWPX_PROGID}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${GENOFFICE_HWPX_PROGID}"
!macroend

!macro GenOfficeRegisterOpenWithMindmap
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_MINDMAP_PROGID}" "" "Mind Map"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_MINDMAP_PROGID}\DefaultIcon" "" "$INSTDIR\resources\mindmap.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_MINDMAP_PROGID}\shell\open\command" "" '"$appExe" "%1"'
  WriteRegNone SHELL_CONTEXT "Software\Classes\.xmind\OpenWithProgids" "${GENOFFICE_MINDMAP_PROGID}"
!macroend

!macro GenOfficeUnregisterOpenWithMindmap
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.xmind\OpenWithProgids" "${GENOFFICE_MINDMAP_PROGID}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${GENOFFICE_MINDMAP_PROGID}"
!macroend

!macro GenOfficeRegisterOpenWithDrawing
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_DRAWING_PROGID}" "" "Drawing"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_DRAWING_PROGID}\DefaultIcon" "" "$INSTDIR\resources\excalidraw.ico"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${GENOFFICE_DRAWING_PROGID}\shell\open\command" "" '"$appExe" "%1"'
  WriteRegNone SHELL_CONTEXT "Software\Classes\.excalidraw\OpenWithProgids" "${GENOFFICE_DRAWING_PROGID}"
!macroend

!macro GenOfficeUnregisterOpenWithDrawing
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.excalidraw\OpenWithProgids" "${GENOFFICE_DRAWING_PROGID}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${GENOFFICE_DRAWING_PROGID}"
!macroend

; Windows' "Default apps" page picks an app by its registered capabilities and
; records the ProgId the app declared for the type. Without this entry Windows
; only knows the bare IeumOffice.exe application and records
; Applications\IeumOffice.exe, whose icon is the app logo: a .hwp chosen that way
; shows the logo instead of hwp.ico, while a .hwpx chosen from our Open-With
; ProgId shows the document icon. Registering capabilities does not change any
; default by itself; it makes the user's choice land on the per-type ProgId
; (whose DefaultIcon is the document icon). The .hwp/.hwpx/.xmind/.excalidraw/.odt ProgIds
; are the product-own Open-With ones defined above; the rest are the ProgIds
; electron-builder writes for the Windows file associations.
!define GENOFFICE_CAPABILITIES_KEY "Software\IeumOffice\Capabilities"

!macro GenOfficeRegisterApplicationCapabilities
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCT_NAME}" "${GENOFFICE_CAPABILITIES_KEY}"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}" "ApplicationIcon" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".docx" "IeumOffice.WordDocument"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".xlsx" "IeumOffice.ExcelWorkbook"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".xlsm" "IeumOffice.ExcelMacroEnabledWorkbook"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".xls" "IeumOffice.Excel972003Workbook"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".pptx" "IeumOffice.PowerPointPresentation"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".csv" "IeumOffice.CSVDocument"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".tsv" "IeumOffice.TSVDocument"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".pdf" "IeumOffice.PDFDocument"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".md" "IeumOffice.MarkdownDocument"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".markdown" "IeumOffice.MarkdownDocument"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".html" "IeumOffice.HTMLDocument"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".htm" "IeumOffice.HTMLDocument"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".hwp" "${GENOFFICE_HWP_PROGID}"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".hwpx" "${GENOFFICE_HWPX_PROGID}"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".xmind" "${GENOFFICE_MINDMAP_PROGID}"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".excalidraw" "${GENOFFICE_DRAWING_PROGID}"
  WriteRegStr SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}\FileAssociations" ".odt" "${GENOFFICE_ODT_PROGID}"
!macroend

!macro GenOfficeUnregisterApplicationCapabilities
  ; only our registration and our key; a future sibling under Software\IeumOffice
  ; keeps that parent alive
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "${PRODUCT_NAME}"
  DeleteRegKey SHELL_CONTEXT "${GENOFFICE_CAPABILITIES_KEY}"
  DeleteRegKey /ifempty SHELL_CONTEXT "Software\IeumOffice"
!macroend

!macro customInstall
  Push "$INSTDIR\resources\cli"
  Call GenOfficeAddToUserPath
  !insertmacro GenOfficeRegisterShellNew "docx" "IeumOffice.WordDocument"
  !insertmacro GenOfficeRegisterShellNew "xlsx" "IeumOffice.ExcelWorkbook"
  !insertmacro GenOfficeRegisterShellNew "pptx" "IeumOffice.PowerPointPresentation"
  !insertmacro GenOfficeRegisterOpenWithOdt
  !insertmacro GenOfficeRegisterOpenWithHwp
  !insertmacro GenOfficeRegisterOpenWithHwpx
  !insertmacro GenOfficeRegisterOpenWithMindmap
  !insertmacro GenOfficeRegisterOpenWithDrawing
  !insertmacro GenOfficeRegisterApplicationCapabilities
  !insertmacro UPDATEFILEASSOC
!macroend

!macro customUnInstall
  Push "$INSTDIR\resources\cli"
  Call un.GenOfficeRemoveFromUserPath
  Push $0
  !insertmacro GenOfficeUnregisterShellNew "docx" "IeumOffice.WordDocument"
  !insertmacro GenOfficeUnregisterShellNew "xlsx" "IeumOffice.ExcelWorkbook"
  !insertmacro GenOfficeUnregisterShellNew "pptx" "IeumOffice.PowerPointPresentation"
  !insertmacro GenOfficeUnregisterOpenWithOdt
  !insertmacro GenOfficeUnregisterOpenWithHwp
  !insertmacro GenOfficeUnregisterOpenWithHwpx
  !insertmacro GenOfficeUnregisterOpenWithMindmap
  !insertmacro GenOfficeUnregisterOpenWithDrawing
  !insertmacro GenOfficeUnregisterApplicationCapabilities
  Pop $0
  !insertmacro UPDATEFILEASSOC
!macroend

!ifndef BUILD_UNINSTALLER
${StrStr}

Function GenOfficeAddToUserPath
  Exch $0 ; directory
  Push $1
  Push $2
  Push $3
  ReadRegStr $1 HKCU "Environment" "Path"
  StrLen $2 $1
  ; leave an already oversized PATH alone rather than truncate it
  IntCmp $2 ${GENOFFICE_PATH_MAX} done 0 done
  ${StrStr} $3 ";$1;" ";$0;"
  StrCmp $3 "" 0 done
  StrCmp $1 "" 0 +3
    StrCpy $1 "$0"
    Goto write
  StrCpy $1 "$1;$0"
write:
  WriteRegExpandStr HKCU "Environment" "Path" $1
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
done:
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
${UnStrStr}
${UnStrRep}

Function un.GenOfficeRemoveFromUserPath
  Exch $0 ; directory
  Push $1
  Push $2
  ReadRegStr $1 HKCU "Environment" "Path"
  StrCmp $1 "" done
  ${UnStrStr} $2 ";$1;" ";$0;"
  StrCmp $2 "" done
  StrCpy $1 ";$1;"
  ${UnStrRep} $1 $1 ";$0;" ";"
  ; strip the sentinels added above
  StrCpy $1 $1 -1
  StrCpy $1 $1 "" 1
  WriteRegExpandStr HKCU "Environment" "Path" $1
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif
