# Conectar servidores MCP

Un servidor MCP es un servicio que ofrece a la IA herramientas externas a la aplicación, como buscar leyes o consultar material que administra tu equipo. Una vez conectado un servidor, las ventanas de IA de GenOffice pueden llamar a sus herramientas durante una conversación. Tú decides, herramienta por herramienta, qué puede usar la IA y cómo.

## Añadir un servidor

1. Abre **Configuración ▸ Integraciones** y pulsa **Añadir un servidor** en la tarjeta **Servidores MCP**.
2. Elige cómo añadirlo.
   - **Pegar texto de configuración**: pega entero el texto de configuración de la guía del servidor y pulsa **Leer**. GenOffice rellena los campos. Si un solo texto contiene varios servidores, los confirmas uno por uno. Si el texto lee una clave o un valor de una variable del PC (`${NOMBRE}`), ese campo queda vacío para que lo rellenes tú.
   - **Introducirlo**: escribe un nombre y la dirección. Si la guía del servidor te da una clave, ponla en el campo **Clave (opcional)**.
3. Lee el aviso que hay sobre el botón de añadir y pulsa **Añadir**.
4. Al añadirlo, GenOffice comprueba la conexión enseguida y obtiene la lista de herramientas. Un servidor que necesita iniciar sesión te espera en lugar de abrir el navegador. Pulsa **Comprobar conexión** para ver la lista de herramientas que ofrece el servidor. Si el servidor necesita iniciar sesión, pulsa **Iniciar sesión con el navegador** y termina de iniciar sesión allí.

El nombre de un servidor usa letras, dígitos, `-` y `_`, con un máximo de 24 caracteres. La IA ve las herramientas de este servidor con nombres de la forma `mcp__name__tool`. Si una habilidad llama a herramientas con nombres de esa forma, añade el servidor con el mismo nombre que usa la habilidad.

## Servidores por dirección y servidores en este PC

- A un servidor **por dirección** se llega mediante una dirección web. Las direcciones de internet deben empezar por `https://`. `http://` solo sirve para este PC y para direcciones de red privada, en casa o en el trabajo, y antes confirmas que las claves y el contenido de los documentos viajarán sin cifrar.
- Un servidor **en este PC** es un programa que GenOffice ejecuta en este PC. La pantalla para añadirlo muestra el programa exacto, sus argumentos y los nombres de las variables de entorno que se le pasan. Se ejecuta por primera vez solo después de que pulses **Permitir ejecución**. Si el comando cambia más adelante, el servidor queda detenido hasta que lo permitas de nuevo.
- Si un servidor en este PC necesita un programa que este PC no tiene (Node.js, o uv para servidores de Python), GenOffice pregunta en la tarjeta del servidor, en Configuración, si debe descargarlo. Muestra el tamaño de la descarga y no se descarga nada hasta que pulses **Descargar**. Los programas descargados se quedan dentro de la carpeta de datos de GenOffice y no se cambia la configuración de tu PC.
- Un servidor en este PC arranca cuando hace falta y se detiene tras 10 minutos sin uso. También se detiene cuando cierras GenOffice.

## Elegir qué puede hacer cada herramienta

- Para cada herramienta, elige **Permitir siempre**, **Preguntar antes** o **No usar**.
- Al principio, las herramientas que el servidor marca como de solo lectura quedan en **Permitir siempre** y todas las demás en **Preguntar antes**.
- Cuando la IA llama a una herramienta en **Preguntar antes**, aparece una tarjeta en la ventana de IA. Mira lo que se va a enviar y pulsa **Permitir solo esta vez**, **Permitir siempre en esta conversación** o **Bloquear**. No se ejecuta nada hasta que pulses una. Detener la IA o cerrar la ventana cuenta como bloquear.
- Si el servidor cambia la descripción de una herramienta o los valores que acepta, esa herramienta muestra **Requiere revisión** y queda oculta para la IA hasta que veas el cambio y pulses **Aprobar el cambio**. Un cambio en las indicaciones que el servidor da a la IA se revisa del mismo modo.
- Las herramientas nuevas de un servidor se activan con los mismos ajustes iniciales, y la tarjeta y el botón de la ventana de IA muestran **Herramientas nuevas: n**. La marca desaparece cuando abres la lista de herramientas de ese servidor en Configuración.

## Usar los servidores en una ventana de IA

- Los servidores funcionan en las ventanas de IA de los editores y en Ask AI de Inicio. Mientras un servidor esté activado, aparece un botón **Servidores conectados** junto al campo de entrada.
- Púlsalo para ver el estado de cada servidor y para desactivar o activar un servidor solo en esta conversación. Una conversación nueva empieza con todos los servidores que activaste en Configuración. Un servidor cuya conexión nunca se comprobó muestra **Aún sin comprobar**; compruébala en Ajustes para obtener sus herramientas.
- Si desactivas **Permitir que la IA use herramientas de internet** en **Configuración ▸ Medios de IA y búsqueda**, también se quitan todas las herramientas de los servidores MCP.
- Cuando una habilidad espera una herramienta de un servidor que ahora no puedes usar, la IA dice en su respuesta qué paso no pudo hacer. **Configuración ▸ Habilidades** también muestra, junto a la habilidad, el servidor que necesita.
- La ventana del agente también puede usar las herramientas de los servidores activados. Se aplican los mismos permisos, y una sesión conserva los ajustes con los que empezó. Consulta [Modo agente](help://agent-mode).

## Proteger lo que devuelve un servidor

Cada servidor tiene la opción **Proteger lo que devuelve este servidor**, activada al principio. Mientras está activada, en cuanto algo que ese servidor devolvió está en una conversación, las herramientas que envían datos fuera de la aplicación dejan de funcionar en esa conversación: la búsqueda web, la lectura de una página por su dirección, las herramientas de otros servidores MCP y similares. Las herramientas del mismo servidor siguen funcionando. Empieza una conversación nueva para volver a usar las demás. Puedes desactivarla en un servidor que solo ofrece material público.

La ventana del agente no puede mantener esta protección. Cuando una sesión empieza con uno de esos servidores, la ventana te lo avisa.

## Qué va adónde

- Cuando la IA llama a una herramienta, el texto que la IA eligió va a ese servidor. Puede incluir contenido del documento abierto y de los adjuntos. Las partes ocultas para la IA siguen ocultas.
- Lo que devuelve el servidor va al proveedor de IA que estás usando. Añade solo servidores cuyos responsables te inspiren confianza.
- Las claves, los inicios de sesión y los valores de las variables de entorno se guardan en este PC con el cifrado de tu sistema operativo. Si este PC no puede cifrarlos, solo se recuerdan hasta que cierres la aplicación.
- Al quitar un servidor se borran sus claves y su inicio de sesión, y se pide al servidor que cierre la sesión si lo admite.
