# Inicio rápido: la interfaz y lo esencial

GenOffice es una suite ofimática que funciona en su equipo: una ventana, una fila de pestañas, con ocho editores: Docs (procesamiento de texto), Sheets (hojas de cálculo), Slides (presentaciones), PDF, Markdown y texto plano, HTML, HWP/HWPX (documentos de Hangul) y mapas mentales (.xmind). Cada editor abre y guarda archivos en su propio formato: .docx, .xlsx, .pptx, .pdf, .md, .html, .hwp/.hwpx y .xmind. Editar no requiere red; las funciones de IA sí. El editor de mapas mentales también importa archivos de FreeMind y Freeplane (.mm) como mapas nuevos, que se guardan como .xmind.

## Descripción de la interfaz

La ventana tiene tres partes:

- **Barra de pestañas (arriba)**: cada archivo abierto es una pestaña. La pestaña Inicio de la izquierda siempre está presente y no se puede cerrar; las demás pestañas son sus documentos. Haga doble clic en una pestaña para cambiar el nombre del archivo en el sitio.
- **Área de contenido**: el editor (o la pantalla de inicio) que corresponde a la pestaña activa.
- **Menú**: en la barra de menús del sistema en macOS, en la parte superior de la ventana en Windows/Linux. Los menús Archivo/Edición/Vista se adaptan al editor activo.

## Crear un documento

Sirve cualquiera de estas vías:

- Haga clic en una tarjeta de creación rápida de la sección [Inicio rápido](help://getting-started) de **Inicio** (AI Docs, AI Sheets, AI Slides, …).
- Menú **Archivo ▸ Nuevo**: Docs (⌘N/ctrl+N), Sheets, Slides, Markdown, HTML o PDF.
- Arrastre un archivo a la ventana, o haga doble clic en él en el explorador de archivos (si GenOffice es la aplicación predeterminada).

Un documento nuevo se abre sin título; el archivo en el disco solo se crea al guardarlo por primera vez.

## Abrir archivos

- El menú **Archivo ▸ Abrir** (⌘O/ctrl+O) abre el selector del sistema: .docx / .doc / .odt / .xlsx / .xls / .csv / .tsv / .pptx / .ppt / .pdf / .md / .html.
- Haga clic en cualquier elemento de la lista **Recientes** de la pantalla de inicio.
- `ieumoffice <file>` en un terminal también abre archivos.

## Documentos ODT

Los archivos .odt (texto OpenDocument, el formato que guardan Hancom Office, LibreOffice y otros) se abren en la pestaña Docs, desde cualquier lugar donde se abre un .docx. Un documento nuevo sigue siendo .docx.

- **Funciona como siempre**: editar texto, formato de caracteres y de párrafo, tablas (insertar y eliminar filas y columnas, combinar y dividir celdas), imágenes, encabezados y pies de página, notas al pie y notas al final, configuración de página y secciones, viñetas y numeración, estilos de título, vínculos, buscar y reemplazar, ortografía, impresión, exportación a PDF y HTML, y edición con IA.
- **Desactivado en ODT**: comentarios, control de cambios, comparar, marca de agua, entrada manuscrita, tabla de contenido, insertar ecuaciones, formas, cuadros de texto o gráficos, columnas, citas y bibliografía, títulos y referencias cruzadas, color de página, contraseña y restricción de edición, recomendar solo lectura, fuentes y colores del tema, márgenes simétricos. Sus botones aparecen atenuados; guarde como .docx para usarlos.
- **Se conserva tal cual**: las ecuaciones, gráficos y dibujos del original se muestran como imágenes bloqueadas que se pueden eliminar pero no editar, y las celdas de tabla bloqueadas siguen bloqueadas. Lo que no toque se vuelve a guardar sin cambios. Un ODT con contraseña no se abre; quite antes la contraseña.
- **Guardar como** ofrece .docx y .odt. Antes de cambiar de formato muestra la lista de lo que cambia o se pierde y después vuelve a abrir la pestaña con el archivo nuevo. Markdown y HTML también ofrecen **Exportar como ODT…**.

## El modelo de guardado

- **Guardado manual**: ⌘S/ctrl+S, o Archivo ▸ Guardar / Guardar como. El primer guardado pregunta por la ubicación y el nombre.
- **El autoguardado** sigue el interruptor de cada editor (y el valor predeterminado de la aplicación). Un PDF que solo se lee nunca se reescribe a escondidas, y un documento nuevo sin archivo propio empieza a autoguardarse tras su primer guardado.
- Al cerrar una pestaña con cambios sin guardar, primero se pregunta si se quiere Guardar / Descartar / Cancelar.
- Cada escritura es atómica (archivo temporal y renombrado), así que un corte de luz no puede dejar un archivo a medias.

## Atajos de teclado frecuentes

| Acción            | macOS | Windows / Linux |
| ----------------- | ----- | --------------- |
| Nuevo documento   | ⌘N    | ctrl+N          |
| Abrir             | ⌘O    | ctrl+O          |
| Guardar           | ⌘S    | ctrl+S          |
| Cerrar pestaña    | ⌘W    | ctrl+W          |
| Abrir este manual | F1    | F1              |
| Contraer la cinta | ⌥⌘R   | Ctrl+F1         |

**Contraer la cinta de opciones** funciona en todos los editores. La fila de pestañas permanece y la banda de comandos que hay debajo se oculta; la pestaña seleccionada hace doble función como control de contracción, de modo que mientras la cinta está contraída no hay ninguna pestaña seleccionada y pulsar cualquier pestaña vuelve a mostrar la banda. Hacer doble clic en una pestaña hace lo mismo. La forma en que la dejó se recuerda editor por editor. Docs añade una densidad intermedia: **⌥⌘K** / Ctrl+Alt+K compacta la banda a solo iconos, recordada igual.

Los atajos dentro de cada editor (copiar formato, buscar y reemplazar, operaciones de tabla, …) están en sus capítulos; Docs incluye además un cuadro de diálogo de atajos de teclado en el que se puede buscar (**⌘/**) (véase su capítulo).

## Los atajos Option+Comando

Option+Comando es la capa que Word reserva para los saltos estructurados, y GenOffice la rellena igual. Docs se queda con la mayor parte; Sheets toma dos de las suyas propias para la paridad con Excel; un atajo funciona en todas partes.

**Docs**

| Atajo (macOS)   | Qué hace               | Windows / Linux    |
| --------------- | ---------------------- | ------------------ |
| ⌥⌘1 / ⌥⌘2 / ⌥⌘3 | Título 1 / 2 / 3       | Ctrl+Alt+1 / 2 / 3 |
| ⌥⌘0             | Normal                 | Ctrl+Alt+0         |
| ⌥⌘M             | Párrafo                | Ctrl+Alt+M         |
| ⌥⌘A             | Nuevo comentario       | Ctrl+Alt+A         |
| ⌥⌘F             | Insertar nota al pie   | Ctrl+Alt+F         |
| ⌥⌘E             | Insertar nota al final | Ctrl+Alt+D         |
| ⌥⌘G             | Ir a                   | Ctrl+G             |

Dos de ellos cambian en Windows, por la misma razón que hace que Word los separe. **macOS es dueño de ⌥⌘D** — muestra y oculta el Dock —, así que la nota al final es ⌥⌘E en el Mac y Ctrl+Alt+D en cualquier otro sitio. Y **Ir a** se quita el Alt: Ctrl+G, donde la combinación del Mac sí lo lleva.

**Sheets**, con la cuadrícula enfocada

| Atajo (macOS) | Qué hace        | Windows / Linux |
| ------------- | --------------- | --------------- |
| ⌥⌘0           | Bordes externos | Ctrl+Shift+7    |
| ⌥⌘−           | Sin borde       | Ctrl+Shift+−    |

Windows no es una reescritura del par del Mac. Excel para Mac le da a Sheets **ambos**: ⌘⇧7 y ⌥⌘0 son dos teclas para los mismos bordes externos, así que en Windows el comando conserva la ranura Ctrl+Shift que ya tenía y la capa Option simplemente no está.

Fíjate en que **⌥⌘0 significa Normal en Docs y Bordes externos en Sheets**. Nunca aparecen en el mismo editor, así que en la práctica nada colisiona, pero ⌥⌘0 está ocupado y no está disponible como atajo global.

**Todos los editores**: **⌥⌘R / Ctrl+F1** contrae la cinta de opciones, tal como se ha descrito arriba.

Eso deja ⌥⌘D libre para que GenOffice lo use en macOS si algún comando futuro lo necesita.

## Adónde ir después

- Dónde viven los archivos: [La pantalla de inicio](help://home-screen).
- Gestionar muchos archivos abiertos: [Pestañas y gestión de ventanas](help://tabs-and-windows).
- Dejar que la IA haga el trabajo: [El panel de IA](help://ai-panel).
- Conectar primero la IA: [Conexión por suscripción](help://subscription).
- Idioma, tema, aplicaciones predeterminadas: [Configuración, idioma, tema e integraciones MCP](help://settings-integrations).
