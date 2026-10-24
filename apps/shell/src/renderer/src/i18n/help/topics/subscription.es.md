# Conexión por suscripción

GenOffice hace funcionar su IA con una suscripción que usted ya tiene: una suscripción de Claude (Anthropic) o una suscripción de Codex (OpenAI). Codex es el programa de OpenAI, y en él se inicia sesión con su plan de ChatGPT. No necesita una clave de API, y GenOffice no tiene una cuenta propia en la que registrarse.

## Cómo funciona

- La IA no está integrada en GenOffice. En este PC hay instalado un programa de la empresa —**Claude Code** para una suscripción de Claude, **Codex** para una suscripción de ChatGPT— y GenOffice le pide la respuesta a ese programa.
- Ese programa tiene la sesión iniciada con su propia cuenta, así que cada solicitud cuenta para su propio plan.
- GenOffice nunca muestra un formulario de inicio de sesión propio, y nunca lee ni guarda sus credenciales. Usted inicia sesión en el programa y en la página web de la propia empresa.

## Antes de empezar

Necesita una de estas dos cosas. Tener las dos también vale.

- Una suscripción de Claude (un plan Pro o Max; una cuenta gratuita de Claude no puede conectarse), y el programa Claude Code instalado y con la sesión iniciada en este PC.
- Una suscripción de ChatGPT, y el programa Codex instalado y con la sesión iniciada en este PC.

Si el programa aún no está instalado, o aún no tiene la sesión iniciada, los botones de la sección siguiente se encargan de ello.

## Conectar

1. Abra **Configuración** desde la fila de la parte inferior izquierda de Inicio y elija **IA**. En **Conexión por suscripción** hay una tarjeta para Claude y otra para Codex.
2. Lea lo que dice la tarjeta y pulse su botón. La tabla de abajo explica cada estado.
3. Vuelva a la ventana de GenOffice. La tarjeta vuelve a comprobarse sola, y **Comprobar de nuevo** lo hace al momento.

En el segundo paso de las pantallas de bienvenida del primer arranque, y en el panel de IA cuando no hay ninguna IA conectada, primero se pregunta «¿Qué IA usas ya?». Elija una suscripción de pago a Claude, ChatGPT o ninguna todavía, y solo verá los pasos de esa opción (Instalar el programa → Iniciar sesión → Conectado) y su tarjeta. **Elegir otra forma** le permite volver a elegir, y puede omitirlo todo y conectar más tarde. Si sigue sin conectarse, pulse **Copiar datos para pedir ayuda** y envíe lo copiado a quien le esté ayudando. No incluye ninguna cuenta ni rutas de archivos.

| Lo que dice la tarjeta                           | Qué significa                                                                                                                                   | Qué hacer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Comprobando…**                                 | GenOffice está preguntando al programa en qué estado se encuentra.                                                                              | Espere un momento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **No instalado**                                 | No se encontró el programa en este PC.                                                                                                          | Pulse **Instalar**. El comando de instalación oficial de la empresa se ejecuta en una nueva ventana de terminal, para que pueda ver lo que hace. GenOffice no descarga nada por su cuenta. Si prefiere instalarlo a mano, **Guía oficial de instalación** abre las instrucciones de la empresa.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Sesión no iniciada**                           | El programa está, pero no tiene ninguna sesión iniciada.                                                                                        | Pulse **Iniciar sesión**. La página de inicio de sesión de la empresa se abre en el navegador: inicie sesión allí y permita el acceso, y la tarjeta se conecta sola. Tómese su tiempo; iniciar sesión puede tardar un poco. Si el navegador no llega a abrirse, pulse **¿No se abrió el navegador?** en la tarjeta (a los 25 segundos pasa a ser un botón **Abrir la ventana de inicio de sesión**). No lo pulse mientras siga iniciando sesión en el navegador: detiene ese inicio de sesión y empieza de nuevo. En la parte superior de la ventana de inicio de sesión que se abre se indica lo que hay que hacer. Para pegar un código en ella, haga clic con el botón derecho dentro de la ventana y pulse Intro. Es normal que el código pegado no se vea; si aparece "Invalid code", vuelva a pegar el código en la misma ventana. Para dejar de iniciar sesión, pulse **Cancelar inicio de sesión**. |
| **Conectado**                                    | Se confirmó un inicio de sesión con suscripción. Se muestra el nombre del plan cuando el programa lo comunica.                                  | Nada. La IA está lista para usarse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Sesión iniciada, pero no con una suscripción** | El programa tiene la sesión iniciada con una clave de API o una cuenta de pago por consumo, o no se pudo confirmar el tipo de inicio de sesión. | Vea «Inicios de sesión de pago por consumo» más abajo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **No se pudo comprobar la conexión**             | Falló la propia comprobación. El motivo se muestra en la tarjeta.                                                                               | Pulse **Comprobar de nuevo**. Si dice que el programa es demasiado antiguo, pulse **Actualizar**: la actualización oficial de la empresa se ejecuta en una ventana nueva. Cuando termine allí, vuelva a GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

La conexión se comprueba al arrancar la aplicación, al abrir Configuración y al volver a la ventana después de iniciar una instalación o un inicio de sesión.

## Sin suscripción: IA gratuita

¿No tiene suscripción a Claude ni a ChatGPT? En Configuración ▸ IA, **Usar gratis** conecta en su lugar una IA gratuita. Si elige **Ninguna todavía** en el segundo paso de las pantallas de bienvenida, aparecen las mismas tarjetas, y si la elige en el panel de IA cuando no hay nada conectado, se ofrece **Conectar una IA gratuita**.

- **OpenRouter**: pulse **Conectar en el navegador**. El navegador abre OpenRouter; regístrese o inicie sesión, y permita el acceso. Cuando el navegador indique que ya está conectado, cierre la pestaña y vuelva. No hay que copiar ninguna clave, y la tarjeta muestra cuántas solicitudes gratuitas quedan hoy.
- **Google Gemini**: pulse **Obtener una clave**, cree una clave en Google AI Studio, péguela en la tarjeta y pulse **Conectar**. Solo para mayores de 18 años. Una clave creada en un proyecto de Google con la facturación activada puede generar cargos.
- Una vez conectada, esa IA pasa a ser la **IA que se usa**. Si están conectadas las dos, **Usar esta IA** en una tarjeta cambia de una a otra. **Desconectar** quita la clave de GenOffice.
- Los modelos gratuitos son más débiles que los de suscripción, y cada día admite un número limitado de solicitudes. Una sola edición de un documento puede consumir varias. Cuando se agota el cupo de hoy, el panel de IA lo indica, junto con el momento en que se podrá volver a usar.
- Mientras la use gratis, lo que envíe puede utilizarse para mejorar la IA de esa empresa. Tenga cuidado con los documentos que contengan datos personales.

## Inicios de sesión de pago por consumo

Una tarjeta que dice **Sesión iniciada, pero no con una suscripción** lleva una advertencia: «Esto no es una suscripción: se cobra según lo que uses.»

- GenOffice no usa ese inicio de sesión hasta que usted pulsa **Usar de todos modos**. A partir de entonces, cada solicitud se factura a esa cuenta.
- Ni siquiera entonces se elige automáticamente. Elíjalo usted mismo en **IA que se usa**, donde aparece marcado como **De pago**.
- Su permiso se recuerda solo para ese programa. Se borra cuando se cierra la sesión del programa o cambia su inicio de sesión.
- Para usar su suscripción en su lugar, inicie sesión en el programa con la cuenta de su suscripción y pulse **Comprobar de nuevo**.

## Cambiar de cuenta o cerrar sesión

Cuando el programa tiene la sesión iniciada, su tarjeta muestra la cuenta en uso junto al nombre del plan, si el programa la comunica. También tiene dos botones.

- **Iniciar sesión con otra cuenta** vuelve a poner en marcha el inicio de sesión del propio programa. Complételo en la ventana que se abre, con la otra cuenta.
- **Cerrar sesión** ejecuta el cierre de sesión del propio programa. Después, la tarjeta indica **Sesión no iniciada**.
- Ambas acciones se aplican a ese programa en todo este PC, no solo a GenOffice. Si también usa Claude Code o Codex en una terminal, allí también se cierra la sesión o se cambia a la otra cuenta. Por eso GenOffice le pide confirmación antes.
- La cuenta y estos dos botones solo aparecen aquí, en Configuración ▸ IA. GenOffice muestra la cuenta y no la guarda en ningún sitio.

## Qué IA se usa

**IA que se usa**, en Configuración ▸ IA, empieza en **Automático**. Automático decide en este orden:

1. Claude, cuando su tarjeta dice Conectado.
2. Si no, Codex, cuando su tarjeta dice Conectado.
3. Si no, no hay ninguna IA conectada, y el panel de IA muestra la guía de conexión en lugar de un error.

Automático nunca elige nada que cueste dinero adicional: ni una clave de API ni un inicio de sesión de pago por consumo. Estos solo se usan mientras usted mismo los elija.

También puede elegir usted una IA, en el mismo sitio o en la lista de modelos de la parte inferior del panel de IA. Si la que eligió deja de funcionar, GenOffice no pasa a otra sin avisar. Le dice qué ha ocurrido y le muestra cómo volver a conectar.

La lista de modelos muestra los modelos que comunica el propio programa: cada uno con su nombre y, al lado, su identificador exacto, y **Modelo predeterminado** indica a qué modelo corresponde en ese momento. La etiqueta de la parte inferior del panel de IA y **IA que se usa** también nombran ese modelo. Leer la lista no le pregunta nada a la IA, así que no cuenta para su plan. Si el programa es demasiado antiguo para comunicar sus modelos, se muestra en su lugar una lista breve integrada.

Allí donde se puede elegir Codex, se muestra una línea junto a él: «Usar una suscripción de Codex dentro de una aplicación no es un método recomendado oficialmente por OpenAI.» Decida teniéndolo en cuenta.

## Cuando una solicitud se detiene

Una solicitud se detiene cuando se agota el límite del plan, cuando la sesión ha caducado o cuando el programa ya no está. GenOffice no cambia a otra IA por su cuenta.

- El motivo se muestra allí donde se detuvo la respuesta. Si se agotó un límite, también se muestra la hora a la que se restablece, cuando el programa la comunica.
- Si su otra suscripción está conectada, aparece un botón **Continuar con …**, por ejemplo **Continuar con Codex**. Al pulsarlo, esa pasa a ser la IA que se usa —la lista de modelos muestra el cambio— y la solicitud se ejecuta de nuevo.
- Si la única otra conexión es un inicio de sesión de pago por consumo que usted permitió, el mismo botón viene con una nota sobre el coste.
- Nunca hay un botón que le lleve a una clave de API.

## La línea de uso

Cuando ha usado el 80 % o más de un límite, el panel de IA muestra una línea como «85 % usado · se restablece a las 15:00». Claude comunica un límite de 5 horas y un límite de 7 días, y Codex se muestra igual cuando los comunica. Por debajo del 80 %, o cuando el programa no comunica nada, no se muestra ninguna línea.

## Qué se envía y adónde

La primera vez que se puede usar una suscripción, GenOffice muestra un aviso una sola vez. Para leerlo de nuevo, vaya a Configuración ▸ IA ▸ **Aviso de primera conexión** y pulse **Ver de nuevo**. Dice tres cosas:

- El contenido del documento y tu conversación se envían a Anthropic u OpenAI con tu propia cuenta.
- Que ese contenido se use para entrenar IA depende de los ajustes de tu propia cuenta en esa empresa, no de GenOffice.
- GenOffice desactiva el guardado del historial de conversaciones de Codex, pero Codex puede seguir guardando sus propios registros de diagnóstico en este PC.

Lo que haya ocultado con **Ocultar la selección a la IA** no se envía, sea cual sea la IA que use.

## Conviene saber

- **Velocidad.** Una respuesta a través de una suscripción empieza unos segundos más tarde que con una clave de API, porque primero tiene que arrancar el programa de la empresa.
- **Plan gratuito de ChatGPT.** Aparece como Conectado, pero sus límites son pequeños, así que las solicitudes se detienen antes. La línea de uso no aparece con él.
- **Generación de imágenes.** En esta versión una suscripción no genera imágenes, con ningún plan. Para eso hace falta la clave de un proveedor de imágenes; vea [Modelos de IA y ajustes](help://ai-models).
- **Proxies.** Claude Code y Codex no toman la configuración de proxy de GenOffice. Usan el proxy definido para este PC, por ejemplo la variable de entorno `HTTPS_PROXY`, igual que cuando se ejecutan en un terminal. Si no pueden conectarse en un terminal, tampoco podrán desde aquí.
- **Comandos y otros programas.** Una solicitud que llega del comando `ieumoffice` o de un agente de codificación conectado no usa su suscripción a menos que usted lo permita. Vea [Conectar un agente de programación](help://mcp).
