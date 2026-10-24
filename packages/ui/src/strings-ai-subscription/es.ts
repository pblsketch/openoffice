import type { zh } from './zh'

export const es = {
  aiAssistant: 'Asistente de IA',
  cardChecking: 'Comprobando…',
  cardNotInstalled: 'No instalado',
  cardSignedOut: 'Sesión no iniciada',
  cardSigningIn: 'Iniciando sesión…',
  cardReady: 'Conectado',
  cardReadyPlan: 'Conectado · {plan}',
  cardMetered: 'Sesión iniciada, pero no con una suscripción',
  cardMeteredAccepted: 'En uso · se cobra por consumo',
  cardError: 'No se pudo comprobar la conexión',
  cardErrNeedsUpdate:
    'El programa {provider} de este PC es demasiado antiguo. Actualízalo y comprueba de nuevo.',
  cardErrNeedsUpdateVersion:
    'El programa {provider} de este PC ({version}) es demasiado antiguo; se necesita la {minimum} o posterior. Ejecuta {command} en una terminal y comprueba de nuevo.',
  cardErrNeedsUpdatePath: 'Archivo que ejecuta esta aplicación:',
  cardErrNeedsUpdateWindows:
    'Actualizar {provider} dentro de WSL (Ubuntu) o en otra carpeta no cambia este archivo. Ejecuta {command} en Windows PowerShell.',
  cardErrTimeout: 'El programa {provider} no respondió a tiempo. Comprueba de nuevo en un momento.',
  cardErrFailed: 'Algo salió mal al comprobar {provider}. Comprueba de nuevo.',
  actionInstall: 'Instalar',
  actionLogin: 'Iniciar sesión',
  actionLoginWindow: '¿No se abrió el navegador?',
  actionRecheck: 'Comprobar de nuevo',
  actionAcceptMetered: 'Usar de todos modos',
  actionInstallHelp: 'Guía oficial de instalación',
  actionOpenSettings: 'Abrir ajustes',
  actionDismiss: 'Cerrar',
  actionSwitchAccount: 'Iniciar sesión con otra cuenta',
  actionLogout: 'Cerrar sesión',
  installNote:
    'El comando de instalación oficial de {vendor} se ejecuta en una nueva ventana de terminal.',
  loginNote: 'La página de inicio de sesión que se abre es la de {vendor}.',
  signingInBrowserNote:
    'Inicia sesión con tu cuenta de {vendor} en el navegador que se abrió y permite el acceso. Se conecta solo cuando termines.',
  signingInWindowNote:
    'Sigue las instrucciones de la parte superior de la ventana de inicio de sesión que se acaba de abrir. Inicia sesión en la página de {vendor} que se abrió en el navegador: la ventana se cierra sola y se completa la conexión. Una página de inicio de sesión abierta antes ya no funciona; ciérrala.',
  meteredWarning: 'Esto no es una suscripción: se cobra según lo que uses.',
  meteredMeaning:
    'Este inicio de sesión usa una clave de API o una cuenta de pago por consumo, o no se pudo confirmar su tipo. «Usar de todos modos» permite que la IA funcione con esta conexión, y cada solicitud se factura a esa cuenta.',
  connectTitle: 'Conecta una IA para empezar',
  connectBody:
    'La IA funciona con la suscripción de Claude o Codex que ya tienes. No hace falta ninguna clave de API.',
  connectProviderTitle: 'La conexión de {provider} no se puede usar ahora',
  connectKeyBody:
    'La configuración de {provider} no está terminada. Complétala en Ajustes o elige otra IA.',
  errNotConnected:
    'No hay ninguna IA conectada. Conecta primero una suscripción de Claude o Codex, o una IA gratuita.',
  errNotInstalled: 'No se encontró el programa {provider} en este PC.',
  errSignedOut: 'La sesión de {provider} ha caducado. Vuelve a iniciar sesión para continuar.',
  errRateLimit: 'Se ha agotado el límite de la suscripción de {provider}.',
  errRateLimitReset:
    'Se ha agotado el límite de la suscripción de {provider}. Se restablece a las {time}.',
  errUnsafeTools:
    'El programa {provider} se inició con sus propias herramientas activadas, así que la ejecución se detuvo por seguridad.',
  errMeteredNotAccepted:
    'La conexión de {provider} es de pago por consumo y aún no la has permitido. Elige «Usar de todos modos» en los ajustes de conexión para usarla.',
  errNeedsUpdate:
    'El programa {provider} es demasiado antiguo para esta función. Actualízalo y vuelve a intentarlo.',
  errHeadlessLimit: 'Se alcanzó el límite por hora de solicitudes automáticas.',
  errHeadlessLimitReset:
    'Se alcanzó el límite por hora de solicitudes automáticas. Volverán a ser posibles a las {time}.',
  connectFreeHint:
    '¿No tienes suscripción? Puedes conectar una IA gratuita en Ajustes en un minuto aproximadamente.',
  actionConnectFree: 'Conectar una IA gratuita',
  errFreeLimit:
    'Se agotó el uso gratuito de hoy. Vuelve a intentarlo mañana o elige otra IA en Ajustes.',
  errFreeLimitReset: 'Se agotó el uso gratuito de hoy. Podrás volver a usarlo a las {time}.',
  continueWith: 'Continuar con {provider}',
  continueMeteredNote:
    'La conexión de {provider} no es una suscripción: continuar se cobra por consumo.',
  usageLine: '{percent} % usado · se restablece a las {time}',
  usageWindowFiveHour: 'Límite de 5 horas',
  usageWindowSevenDay: 'Límite de 7 días',
  noticeTitle: 'Antes de usar la IA con tu suscripción',
  noticeSend:
    'El contenido del documento y tu conversación se envían a Anthropic u OpenAI con tu propia cuenta. Cada solicitud lleva además el nombre, el título y la descripción de cada habilidad configurada como «Decide la IA»; también se envían las habilidades que se usan y los archivos de habilidad que lee la IA.',
  noticeTraining:
    'Que ese contenido se use para entrenar IA depende de los ajustes de tu propia cuenta en esa empresa.',
  noticeCodexHistory:
    'Esta aplicación desactiva el guardado del historial de conversaciones de Codex, pero Codex puede seguir guardando sus propios registros de diagnóstico en este PC.',
  noticePdfWholeDocument:
    'En el editor de PDF, la lectura de páginas con IA y la traducción de documentos pueden enviar imágenes de las páginas y todo el texto del documento.',
  noticeAck: 'Entendido',
  codexNotice:
    'Usar una suscripción de Codex dentro de una aplicación no es un método recomendado oficialmente por OpenAI.',
  truncatedNotice:
    'La entrada era demasiado larga, así que se recortó una parte antes de enviarla.',
  pickerAuto: 'Automático',
  pickerAutoUsing: 'Automático · {provider}',
  pickerAutoUsingModel: 'Automático · {provider} · {model}',
  pickerDefaultModel: 'Modelo predeterminado',
  pickerDefaultModelNamed: 'Modelo predeterminado · {model}',
  pickerSubscription: 'Suscripción',
  pickerPaid: 'De pago',
  pickerPaidTitle: 'Se cobra por consumo, no lo cubre una suscripción',
  pickerNotConnected: 'Conectar IA',
  guideQuestion: '¿Qué IA usas ya?',
  guidePathClaudeTitle: 'Tengo una suscripción de pago a Claude',
  guidePathClaudeBody:
    'Necesitas un plan Pro o Max. Una cuenta gratuita de Claude no puede conectarse.',
  guidePathCodexTitle: 'Uso ChatGPT',
  guidePathCodexBody:
    'Inicia sesión en el programa Codex de OpenAI con tu cuenta de ChatGPT. El plan gratuito solo permite un uso reducido.',
  guidePathFreeTitle: 'Ninguna todavía',
  guidePathFreeBody:
    'Conecta una IA gratuita en un minuto aproximadamente. Mientras la uses gratis, lo que envíes puede usarse para mejorar la IA de esa empresa.',
  guideBack: 'Elegir otra forma',
  guideBadgeReady: 'Conectado',
  guideBadgeInstalled: 'Instalado',
  guideBadgeCheck: 'Revisar',
  guideStepsLabel: 'Pasos de conexión',
  stepInstall: 'Instalar el programa',
  stepLogin: 'Iniciar sesión',
  stepReady: 'Conectado',
  installReturnNote:
    'Cuando termine la instalación en esa ventana, vuelve aquí. La aplicación vuelve a comprobarlo sola.',
  loginHowNote:
    'Al pulsarlo se abre un navegador. Inicia sesión con tu cuenta de {vendor} y pulsa Permitir; la conexión se completa sola.',
  signingInStalledNote:
    'Si no se abrió ninguna página de inicio de sesión en el navegador, abre la ventana de inicio de sesión con el botón de abajo. Si todavía estás iniciando sesión en el navegador, mejor termina allí: el botón detiene ese inicio de sesión y empieza de nuevo.',
  actionLoginWindowOpen: 'Abrir la ventana de inicio de sesión',
  loginWindowTitle: 'Inicio de sesión en {provider}',
  loginWindowIntro:
    'Esta es la ventana de inicio de sesión del programa {provider}. El texto en inglés que aparece debajo es del programa {provider}.',
  loginWindowStepBrowser:
    'Cuando se abra en el navegador la página de inicio de sesión de {vendor}, inicia sesión y permite el acceso. Después, esta ventana se cierra sola.',
  loginWindowStepAddress:
    'Si no se abrió ningún navegador, selecciona la dirección de abajo que empieza por https:// arrastrando el puntero sobre ella y haz clic con el botón derecho para copiarla. Pégala en la barra de direcciones del navegador para abrir la página de inicio de sesión.',
  loginWindowStepCode:
    'Si el navegador muestra un código después de iniciar sesión, copia el código completo (usa su botón de copiar si lo tiene). Haz clic con el botón derecho una vez dentro de esta ventana para pegarlo y pulsa Intro. Es normal que el código pegado no se vea.',
  loginWindowStepInvalid:
    'Si aparece "Invalid code", el código no se copió completo. No cierres esta ventana, vuelve a copiar el código y pégalo.',
  loginWindowClosing:
    'El inicio de sesión no terminó. Cuando hayas leído los mensajes de arriba, pulsa Intro para cerrar esta ventana. Para volver a intentarlo, pulsa otra vez el botón de iniciar sesión.',
  actionCancelLogin: 'Cancelar inicio de sesión',
  actionUpdate: 'Actualizar',
  updateNote:
    'Al pulsarlo, la actualización oficial de {vendor} se ejecuta en una ventana nueva. Cuando termine allí, vuelve aquí.',
  guideInfoHint:
    '¿Sigue sin funcionar? Copia los datos de conexión y envíalos a quien te esté ayudando. No incluyen ninguna cuenta ni rutas de archivos.',
  actionCopyInfo: 'Copiar datos para pedir ayuda',
  copyInfoDone: 'Copiado',
  actionConnectHelp: 'Ver cada paso en pantalla (página en coreano)',
} satisfies Record<keyof typeof zh, string>
