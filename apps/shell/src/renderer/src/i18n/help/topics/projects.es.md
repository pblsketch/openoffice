# Proyectos

Un proyecto es una carpeta de tu PC. Si eliges un proyecto en un panel de IA, la IA trabaja conociendo los archivos, las instrucciones, la memoria y los chats de esa carpeta. Reúne en una carpeta los documentos de un mismo trabajo y podrás seguir en Hangul o en Slides un chat que empezaste en Docs, sin volver a explicar el contexto en cada documento.

## Elegir un proyecto

- En el panel de IA de cada editor y en **Ask AI** de Inicio, el nombre del proyecto actual aparece a la izquierda, debajo del campo de entrada. Si no has elegido ninguno, pone **Sin proyecto**.
- Haz clic en él para abrir la lista: proyectos **Fijados** y **Recientes**, **Nuevo proyecto**, **Añadir carpeta** y **Sin proyecto**. Escribe en el cuadro de arriba para buscar; si ningún proyecto coincide, puedes crear uno nuevo con ese nombre.
- Al pasar el cursor por una fila aparecen fijar, **Abrir carpeta** y **Quitar de la lista**. Quitar un proyecto de la lista no toca la carpeta ni sus archivos.
- Un proyecto cuya carpeta se movió o se borró aparece atenuado como **Carpeta no encontrada**. Haz clic en él y elige la carpeta movida para seguir con el mismo proyecto.
- Al abrir un documento que está dentro de la carpeta de un proyecto, ese proyecto ya viene elegido. Si cambias ese documento a **Sin proyecto**, seguirá así la próxima vez que lo abras. El proyecto que elijas para un documento de fuera de la carpeta también se recuerda para ese documento.
- El proyecto elegido se usa a partir de la siguiente petición de ese panel. Cambiarlo en mitad de un chat abre un chat nuevo; el chat en el que estabas se queda donde estaba.

## Nuevo proyecto y Añadir carpeta

- **Nuevo proyecto**: escribe un nombre y se crea una carpeta con ese nombre en tu carpeta de guardado predeterminada (al principio `Documentos\GenOffice`; puedes cambiarla en Configuración). Con **Crear en otro lugar…** eliges otra ubicación. Si ya existe una carpeta con ese nombre, se te pregunta si quieres usarla como proyecto, y **Usar esta carpeta** empieza con ella. Si esa carpeta ya es un proyecto de tu lista, se abre directamente, sin preguntar.
- **Añadir carpeta** (**Usar una carpeta existente** en la pantalla Proyectos de Inicio): usa una carpeta que ya tienes. Sus subcarpetas también cuentan. No se puede elegir una unidad entera, tu carpeta de usuario completa ni carpetas que guardan datos de inicio de sesión o los datos de la app.
- Si abres un documento que está dentro de la carpeta de un proyecto que no figura en tu lista, debajo del campo de entrada aparece «Este documento está en la carpeta del proyecto "…"» con un botón **Usar**. Pulsarlo equivale a Añadir carpeta.
- Cuando una carpeta que te ha pasado otra persona ya trae instrucciones o memoria, `AGENTS.md` o `CLAUDE.md`, o chats escritos en otro PC, la app te los muestra una vez y te pregunta. **Ver todo** te deja leerlo todo antes. **Usar con instrucciones** lo aprovecha todo. **Usar sin instrucciones** no deja que esas instrucciones ni esa memoria lleguen a la IA, oculta los chats de otros PC y deja de añadir memoria; la lectura de archivos sigue funcionando. Más adelante puedes cambiarlo con **Usar también las instrucciones** en la página del proyecto. Si pulsas **Cancelar** o cierras la pregunta sin elegir, la carpeta no se añade.
- Después ya no vuelve a preguntar. Si las instrucciones o la memoria cambian fuera de GenOffice, el panel de IA muestra una vez «Las instrucciones han cambiado», y **Ver** abre esa parte de la página del proyecto.

## Instrucciones y memoria

- Las **instrucciones** son las reglas de este proyecto, por ejemplo «Redacta los informes en viñetas y no abrevies nunca el nombre de la organización». Escríbelas en la página del proyecto en Inicio y pulsa **Guardar**. Si en la raíz de la carpeta hay un `AGENTS.md` o un `CLAUDE.md`, también se leen, y puedes desactivarlos en la página del proyecto.
- La **memoria** son notas que la IA escribe durante los chats: datos, preferencias y decisiones que servirán más adelante, una por línea y con fecha. Cada vez que escribe una, el panel de IA muestra «Recordado: …» con un botón **Eliminar**. Si esa nota ya se eliminó, la línea dice «Memoria borrada: …» y no tiene botón **Eliminar**. No te pide permiso antes.
- Cuando la memoria se alarga, el panel de IA muestra «La memoria se está haciendo larga» con **Ordenar**. Al pulsarlo se fusionan las notas que se solapan o han quedado anticuadas. La versión anterior se conserva y **Deshacer** la recupera. Solo se ordena cuando pulsas el botón, y eso envía una petición a la IA.
- En la página del proyecto puedes borrar notas, editar la memoria entera y desactivarla. Desactivada, no se escribe nada nuevo y la memoria que ya existe se sigue leyendo.
- Si las instrucciones son muy largas, se pierde la parte final, y el panel de IA te lo indica. La memoria se envía siempre completa, por larga que sea.

## Archivos que ve la IA

- Con cada petición, la IA recibe el nombre del proyecto, sus instrucciones y su memoria, y una lista con los nombres de los archivos de la carpeta. Cuando necesita el contenido de un archivo, lo lee ella misma igual que un adjunto, así que lo que está oculto a la IA sigue oculto.
- No lee los documentos abiertos con cambios sin guardar, los archivos ocultos cuyo nombre empieza por un punto ni la carpeta `.ieumoffice`.
- Para que la IA no vea un archivo, pulsa **Ocultar a la IA** en la sección Archivos de la página del proyecto. Se puede deshacer. El archivo sigue apareciendo en los resultados de búsqueda de Inicio.
- En carpetas sincronizadas con OneDrive, Google Drive y similares, los archivos que no están descargados en este PC aparecen como «No está en este PC». Si la IA quiere leer uno, primero se te pregunta si quieres descargarlo.
- Escribe `@` en el campo de entrada y, después de los documentos abiertos, aparece «Archivos de este proyecto». Al elegir uno, queda adjunto. Consulta [El panel de IA](help://ai-panel).
- Los documentos nuevos que la IA crea en un proyecto se guardan en la carpeta del documento actual, o en la raíz de la carpeta del proyecto si lo pides desde Inicio. Si el nombre ya existe, se añade `(2)` para no sustituir ningún archivo.

## Chats

- Un panel de IA con un proyecto elegido muestra arriba el título del chat actual. Haz clic en él para ver la lista de chats del proyecto, un cuadro de búsqueda y **Nuevo chat**. Cualquier chat de la lista se puede retomar en cualquier editor.
- Lo que se hizo en otro editor aparece en una sola línea, como «3 herramientas ejecutadas en Hangul "informe.hwp"». La IA solo usa las herramientas del editor en el que estás.
- Al abrir un documento se muestra el último chat usado en él. Si dos ventanas tienen abierto el mismo chat, un mensaje enviado en una aparece en la otra al momento.
- Los chats escritos en otro PC llevan la marca **Otro PC**.
- En la lista puedes renombrar o borrar chats. Un chat borrado va a la papelera.
- Los chats que un documento tenía antes de esta función están al final de la lista, en **Chats anteriores de este documento**.
- Los chats **Sin proyecto** se guardan por documento, como antes. En Ask AI de Inicio sin proyecto, el chat termina al cerrar la app.

## La página del proyecto en Inicio

**Proyectos**, en la barra lateral de Inicio, es donde creas un **Nuevo proyecto**, eliges **Usar una carpeta existente** y abres uno para gestionarlo.

- **Cabecera**: el nombre (cambiarlo no renombra la carpeta), la ruta de la carpeta, **Abrir en el Explorador de archivos** (en Mac, **Mostrar en el Finder**) y el estado. Cuando el proyecto se usa sin instrucciones, aparece **Usar también las instrucciones**.
- **Instrucciones**: el cuadro de instrucciones, y los `AGENTS.md` y `CLAUDE.md` que se leen junto a él.
- **Memoria**: la lista de notas, **Editar todo**, **Ordenar** y la memoria activada o desactivada.
- **Archivos**: los archivos que ve la IA y los que se le ocultan. Haz clic en el nombre de un archivo para abrirlo.
- **Chats**: los chats de este proyecto. Haz clic en uno para abrir el documento donde se usó por última vez y seguir en ese panel de IA.
- Esta página vuelve a leer la carpeta cada vez que se muestra, así que una nota que la IA acaba de recordar aparece sin salir de ella. Si el archivo de instrucciones o de memoria cambió fuera de GenOffice mientras lo editabas, **Guardar** pregunta primero: **Volver a cargar** lee el archivo cambiado y **Guardar de todos modos** lo sobrescribe con tus cambios.

## Lo que queda en la carpeta y cosas que conviene saber

- Las instrucciones, la memoria y los chats se guardan como archivos de texto en una carpeta `.ieumoffice` dentro de la carpeta del proyecto. Si mueves la carpeta o la copias a otro PC, viajan con ella. En el otro PC, elígela una vez con **Añadir carpeta** en un panel de IA o con **Usar una carpeta existente** en la pantalla Proyectos de Inicio.
- La carpeta `.ieumoffice` solo se crea cuando hay algo que escribir. Puedes abrir y editar sus archivos con el Bloc de notas.
- Lo que escribes en un chat puede acabar en la memoria. Para dejar algo fuera, bórralo con **Eliminar** en la línea «Recordado» o desactiva la memoria.
- Si eliges una carpeta sincronizada como proyecto, sus instrucciones, su memoria y sus chats también se suben a ese servicio. La app te avisa una vez, la primera vez que la eliges.
- En una carpeta compartida que usan varias personas, la memoria y los chats pueden mezclarse.
- En una carpeta en la que la app no puede escribir, como una de solo lectura, las instrucciones y la lectura de archivos siguen funcionando, pero los chats y la memoria no se guardan. El panel de IA te lo indica.
- La ventana del agente todavía no usa proyectos. Un agente también puede modificar los archivos de la carpeta `.ieumoffice`, así que en una carpeta con material que no conoces, usa una de las formas que preguntan antes. Consulta [Modo agente](help://agent-mode).
