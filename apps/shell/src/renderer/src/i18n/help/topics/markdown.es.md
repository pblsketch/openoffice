# El editor Markdown

El editor Markdown abre .md / .markdown — y .txt / .json, directo a la vista de código — con código más vista previa renderizada.

- **Abrir**: desde Inicio o Archivo ▸ Abrir; la línea de comandos también funciona.
- **Editar**: edición de texto sin formato; las extensiones GFM (tablas, listas de tareas, tachado, enlaces automáticos) se renderizan en la vista previa.
- **Vista previa**: en vivo; los recursos relativos como las imágenes se resuelven junto al documento.
- **Guardar**: fiel byte a byte: el BOM, los CRLF y la presencia de un salto de línea final se conservan; un guardado sin cambios no reescribe el archivo.
- **Buscar y reemplazar**: ctrl+F busca en el código fuente; Reemplazar todo lo reescribe.
- **IA**: unos botones predefinidos permiten que el asistente reescriba, amplíe o traduzca el documento. Una selección puede ocultarse a la IA (ver el capítulo del panel de IA).

## La barra de herramientas

Una fila de botones encima del editor (pase el cursor para ver las descripciones):

- **Archivo e historial**: Guardar, Guardar como, Deshacer, Rehacer, Buscar; el interruptor de **Autoguardado** de la derecha escribe los cambios en el disco a intervalos.
- **Botón de IA**: abre el panel de IA; a su lado están los preajustes de reescritura, ampliación y traducción.
- **Estilo de párrafo** (desplegable): cambiar entre el cuerpo del texto y los niveles de título.
- **Formato en línea**: **Negrita**, _Cursiva_, ~~Tachado~~, `Código en línea`, enlace.
- **Listas**: con viñetas, numerada, lista de tareas.
- **Insertar**: tabla, imagen, línea separadora.
- **Propiedades**: inserta el bloque YAML front matter al principio del archivo o salta hasta él.
- **Esquema**: saltar por la jerarquía de títulos.
- **Ortografía**: activa o desactiva la corrección ortográfica de este documento.
- **Ajustes de alojamiento de imágenes**: las imágenes pegadas o soltadas van primero a tu propio almacenamiento — compatible S3 (R2/OSS/COS/MinIO), SM.MS o GitHub — con la copia local en assets como respaldo.

Tres ejemplos rápidos:

- **Título**: ponga el cursor en la línea ▸ desplegable de estilo de párrafo ▸ «Título 1».
- **Tabla**: haga clic en **Insertar tabla** ▸ arrastre el número de filas y columnas ▸ escriba en las celdas; la vista previa lo renderiza de inmediato.
- **Lista de tareas**: seleccione unas líneas ▸ haga clic en **Lista de tareas** ▸ cada línea pasa a ser `- [ ]` y se representa como casillas de verificación en la vista previa.

## Enlaces entre notas

Los enlaces de una nota se siguen con **Ctrl+clic** (**⌘+clic** en Mac). Un clic normal sigue sirviendo para editar el texto.

- **Encabezados**: `[texto](#encabezado)` y `[[#Encabezado]]` saltan a ese encabezado en la misma nota.
- **Otros archivos**: `[texto](other.md)` o `[texto](../folder/report.pdf)` abre el archivo en su propia pestaña, partiendo de la carpeta de la nota. Un enlace a un encabezado de otra nota Markdown abre esa nota en el encabezado.
- **Enlaces wiki**: `[[Nota]]`, `[[Nota#Encabezado]]` y `[[Nota|texto visible]]` se buscan en cualquier parte de la bóveda de la nota: la primera carpeta por encima de la nota que contiene `.obsidian`, o si no la propia carpeta de la nota. Si dos archivos se llaman igual, gana el más cercano a la nota.
- **Autocompletado**: escriba `[[` y elija una nota de la bóveda en la lista; se escribe como `[[Nombre]]`.
- **Imágenes**: `![[imagen.png]]` muestra la imagen bajo su texto y `![[imagen.png|300]]` fija el ancho. Solo se muestran imágenes de la bóveda de hasta 20 MB.
- **Lo que no cambia**: los enlaces wiki siguen siendo texto plano en el archivo, así que guardar nunca los reescribe. Los enlaces web se abren en el navegador. Las rutas de red (`\\server\share`), los enlaces en la vista de código y la IA no abren nada.

## Exportar

Menú Archivo, todo local y todo pregunta dónde poner el resultado:

- **Exportar como Word…** y **Exportar como PDF…** escriben un .docx o .pdf de verdad.
- **Exportar como ODT…** escribe un .odt (texto OpenDocument) con la misma conversión que la exportación a Word; si algo cambia o se pierde por el camino, verá la lista y confirmará antes.
- **Exportar como imágenes…** escribe un PNG por página en la carpeta que elija.
- **Convertir y abrir en Docs** convierte a .docx y lo abre en la pestaña Docs integrada aquí en la app: no es un traspaso a nada en la nube, y la copia convertida vive en una carpeta de caché que se limpia al cabo de una semana aproximadamente.

## Vista de código fuente

La cinta de opciones lleva un conmutador **Código fuente** (localizado junto con la aplicación). Al activarlo, el editor se sustituye por el Markdown en crudo: exactamente el texto que escribe un guardado, nada embellecido, nada normalizado por debajo de usted.

- **La edición es fiel byte a byte.** Un guardado desde la vista de código fuente produce los mismos bytes que un guardado desde el editor: el BOM, los CRLF y la presencia de un salto de línea final se conservan.
- **Es el mismo documento.** Alterne entre el editor y la fuente tantas veces como quiera; la fuente es el propio texto del editor, no una copia que haya que combinar.
- **La barra de herramientas de formato no está disponible** mientras esta vista está abierta, porque la mayoría de esos botones insertan construcciones del editor que solo tienen sentido en la parte renderizada. Vuelve a aparecer cuando cierra la vista.
- **.txt y .json** se abren aquí directamente en vista de código: no hay nada que renderizar, así que el código _es_ el documento.
