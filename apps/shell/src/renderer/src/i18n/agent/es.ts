import type { zh } from './zh'

export const es = {
  windowTitle: 'Agente',
  homeCardSub: 'Trabaja en una carpeta con Claude Code o Codex',
  intro:
    'El agente ejecuta tu Claude Code o Codex en la carpeta que elijas. Puede leer los archivos que hay en ella, crear otros nuevos, usar tus habilidades, ejecutar scripts y modificar los documentos abiertos en GenOffice.',
  folderLabel: 'Carpeta del proyecto',
  folderPick: 'Elegir una carpeta…',
  folderNone: 'No se ha elegido ninguna carpeta',
  recentLabel: 'Carpetas recientes',
  providerLabel: 'Programa',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'En Windows, los comandos que permites se ejecutan sin aislamiento y pueden acceder a todo tu PC y a internet.',
  providerCodexNote:
    'Los comandos se ejecutan en el espacio aislado de Codex: solo se puede escribir en la carpeta del proyecto y no hay acceso a internet.',
  providerBlocked:
    'Aún no disponible: todavía no se puede impedir que Codex lea su propio archivo de inicio de sesión.',
  connChecking: 'Comprobando la conexión…',
  connUnavailable: 'No conectado. Inicia sesión en Configuración → IA.',
  connMetered: 'Conectado con un inicio de sesión de pago por uso que aceptaste.',
  modeLabel: 'Cuándo preguntarte',
  modeAskCommands: 'Preguntar antes de cada comando',
  modeAskCommandsDesc:
    'Leer y escribir archivos en la carpeta del proyecto se hace sin preguntar. Antes de ejecutar un comando o un script, se te pregunta.',
  modeAskWrites: 'Preguntar antes de escribir y de ejecutar comandos',
  modeAskWritesDesc:
    'Solo la lectura se hace sin preguntar. Antes de escribir un archivo o de ejecutar un comando, se te pregunta.',
  modeTrust: 'Confiar en este proyecto',
  modeTrustDesc:
    'No se pregunta nada. Codex sigue dentro de su espacio aislado; en Claude Code, su propio revisor comprueba cada acción en tu lugar.',
  warningTitle: 'Antes de empezar',
  warningCommands:
    'Los comandos que ejecuta el agente pueden cambiar archivos y usar internet. Un documento que alguien te haya enviado puede contener instrucciones ocultas.',
  warningRedaction:
    'Las partes que ocultaste a la AI solo quedan ocultas en los documentos abiertos en GenOffice. Los archivos que el agente lee de la carpeta se envían tal cual.',
  warningUsage:
    'Un agente trabaja en muchos pasos y gasta más de tu suscripción que el panel de AI.',
  warningAccept: 'Entendido',
  start: 'Iniciar',
  starting: 'Iniciando…',
  stop: 'Detener',
  newSession: 'Nueva sesión',
  send: 'Enviar',
  inputPlaceholder: '¿Qué debe hacer el agente?',
  you: 'Tú',
  agent: 'Agente',
  startedLine: '{program} se inició en {folder}',
  skillsLine: '{n} habilidades disponibles',
  skillsLineOne: '{n} habilidad disponible',
  toolRunning: 'En curso',
  toolDone: 'Hecho',
  toolFailed: 'Error',
  toolDenied: 'Rechazado',
  actRead: 'Leer',
  actWrite: 'Escribir',
  actCommand: 'Ejecutar',
  actAppTool: 'Editar un documento abierto',
  actSkill: 'Usar una habilidad',
  actOther: 'Usar una herramienta',
  openFile: 'Abrir',
  permTitle: 'El agente pide permiso para:',
  permCommand: 'Ejecutar este comando',
  permWrite: 'Escribir en este archivo',
  permRead: 'Leer un archivo fuera de la carpeta del proyecto',
  permOther: 'Usar la herramienta «{tool}»',
  permReason: 'Motivo: {reason}',
  permAllow: 'Permitir',
  permDeny: 'Rechazar',
  turnFailed: 'El agente no pudo terminar esta solicitud.',
  ended: 'La sesión ha terminado.',
  errBadFolder:
    'No se puede usar esta carpeta. Elige una carpeta con tu propio trabajo: no una unidad entera, ni tu carpeta personal, ni una carpeta de datos de inicio de sesión o de aplicaciones.',
  errNotConnected:
    'Este programa no está conectado. Inicia sesión en Configuración → IA y vuelve a intentarlo.',
  errNotAccepted: 'Primero lee las notas de arriba y confírmalas.',
  errUnsafeTools:
    'El programa se inició con herramientas que la aplicación no le dio, así que se detuvo.',
  errRateLimit: 'Has agotado el límite de tu suscripción. Vuelve a intentarlo más tarde.',
  errSignedOut: 'El programa no tiene la sesión iniciada. Inicia sesión en Configuración → IA.',
  errMetered: 'El programa tiene iniciada una sesión de pago por uso que no aceptaste.',
  errSandboxUnavailable:
    'Codex no puede abrir en este PC el entorno aislado que contiene sus comandos, así que no se inició. Actualiza Windows o elige Claude Code.',
  errNeedsUpdate:
    'El programa es demasiado antiguo para el modo agente. Actualízalo y vuelve a intentarlo.',
  errNotInstalled: 'El programa no está instalado.',
  errGeneric: 'Algo salió mal. Vuelve a intentarlo.',
  documentsUnprotected:
    'Los documentos abiertos después de iniciar la sesión ({n}) quedan fuera de la protección de escritura del programa. Detén e inicia la sesión de nuevo para protegerlos.',
} satisfies Record<keyof typeof zh, string>
