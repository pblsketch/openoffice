import type { zh } from './zh'

export const es = {
  button: 'Colaborar',
  dialogTitle: 'Colaborar',
  tabShare: 'Compartir este documento',
  tabJoin: 'Unirse',
  nameLabel: 'Mi nombre',
  nameHint: 'Se muestra junto a tu cursor en la pantalla de los demás.',
  colorLabel: 'Mi color',
  colorChoice: 'Color {n}',
  shareIntro:
    'Las personas de la misma red (LAN) pueden ver y editar este documento contigo después de introducir el PIN. El archivo solo se guarda en este PC.',
  shareStart: 'Empezar a compartir',
  shareStarting: 'Iniciando…',
  shareStop: 'Dejar de compartir',
  pinLabel: 'PIN',
  pinNew: 'Nuevo PIN',
  pinChanged:
    'Se probaron demasiados PIN incorrectos, así que se cambió el PIN. Las personas que ya se unieron siguen conectadas.',
  addressLabel: 'Dirección de este PC',
  peopleLabel: 'Participantes',
  nobodyYet: 'Todavía no se ha unido nadie.',
  you: 'tú',
  hostBadge: 'comparte',
  joinIntro:
    'Introduce el PIN que te dio la persona que comparte. Elige un documento encontrado en esta red o escribe la dirección.',
  searching: 'Buscando documentos compartidos en esta red…',
  foundLabel: 'Encontrados',
  foundBy: 'compartido por {name}',
  addressInput: 'Dirección',
  addressPlaceholder: 'p. ej., 192.168.0.12',
  pinInput: 'PIN (6 dígitos)',
  join: 'Unirse',
  joining: 'Conectando…',
  close: 'Cerrar',
  leave: 'Salir',
  errPin: 'El PIN no es correcto.',
  errLocked: 'Demasiados PIN incorrectos. Este PC no puede volver a intentarlo durante 10 minutos.',
  errFull: 'Esta sesión está completa.',
  errVersion:
    'El otro PC usa una versión distinta de la aplicación. Actualiza ambos PC a la misma versión.',
  errUnreachable:
    'No se pudo conectar con esa dirección. Comprueba la dirección, la red y el firewall del PC que comparte.',
  errTimeout: 'El PC que comparte no responde.',
  errInvalid: 'Comprueba la dirección y el PIN.',
  errUnavailable: 'No se pudo abrir este documento en este PC.',
  errShareNetwork:
    'No se pudo empezar a compartir en este PC. Comprueba si otro programa está bloqueando la red.',
  errShareTooLarge: 'Este documento es demasiado grande para compartirlo.',
  errShareBusy: 'Esta pestaña ya está en una sesión.',
  errShareSaveFirst: 'Hay cambios sin guardar. Guarda primero y luego comparte.',
  errShareEncrypted: 'No se puede compartir un documento protegido con contraseña.',
  errShareUnsupported: 'Este documento no se puede compartir en este momento.',
  endedByHost:
    'La persona que comparte ha finalizado la sesión. Este documento es ahora una copia sin guardar en este PC.',
  endedLost:
    'Se ha perdido la conexión con el PC que comparte. Este documento es ahora una copia sin guardar en este PC.',
  endedLeft: 'Has salido de la sesión. Este documento es ahora una copia sin guardar en este PC.',
  endedHostStopped: 'Se ha dejado de compartir.',
  guestSaveBlocked: 'Durante una sesión, es la persona que comparte quien guarda el archivo.',
  guestBlocked: 'Esta función no está disponible durante una sesión.',
  hostBlocked: 'Esta función no está disponible mientras haya otras personas en la sesión.',
  viewOnly:
    'En este formato solo edita la persona que comparte; quienes se unen lo ven en directo.',
  lanNotice:
    'Lo que se intercambia está cifrado, así que solo quien introduzca el PIN puede leerlo. Mientras compartes, tu nombre y el título del documento son visibles en la red.',
  firewallHint:
    'Si el Firewall de Windows te lo pregunta la primera vez que compartas, permite el acceso en redes privadas.',
  statusHosting: 'Compartiendo · {count}',
  statusGuest: 'En el documento de {name}',
  dismiss: 'Entendido',
} satisfies Record<keyof typeof zh, string>
