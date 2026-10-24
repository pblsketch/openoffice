# Libros EPUB: leer, editar y traducir

El editor de libros electrónicos abre libros EPUB (`.epub`) en una pestaña. Puede leer el libro, corregir su texto directamente en la página, preguntar a la IA sobre él y traducirlo a un nuevo archivo EPUB. No hay ninguna pantalla para editar el código de un capítulo.

## Abrir un libro

- Abra un archivo `.epub` desde el cuadro de diálogo de apertura, arrastrándolo a la ventana, desde los archivos recientes, el árbol de carpetas o la lista de Google Drive. En Windows también aparece en «Abrir con». Instalar GenOffice no lo convierte en el programa predeterminado para los archivos `.epub`.
- Si el libro ya está abierto, su pestaña pasa al frente.
- Los libros con protección anticopia (DRM) no se abren: ábralos en la aplicación de la tienda donde los compró. Los archivos dañados y los que no son libros EPUB tampoco se abren, y se muestra el motivo.
- Los **libros de diseño fijo** (maquetados página a página, como los libros ilustrados y los cómics) se abren solo para lectura. La edición, la edición con IA, el reemplazo y la traducción están desactivados, y la línea de estado explica por qué. Leer y preguntar a la IA siguen funcionando.
- Un capítulo cuyo archivo está mal formado se muestra lo mejor posible pero no se puede editar, y una nota en su parte superior lo indica. Se guarda sin cambios y permanece en el idioma original en las traducciones.

## Leer

- El panel **Contenido** de la izquierda muestra la tabla de contenido del libro. Haga clic en una entrada para ir allí. Un libro que no la tiene recibe una lista de sus capítulos.
- Cada capítulo se desplaza hacia arriba y hacia abajo. Siga desplazándose más allá del final de un capítulo para pasar al siguiente, o más allá de su inicio para volver al anterior. La línea de estado muestra en qué capítulo se encuentra.
- La pestaña **Vista** cambia el tamaño del texto y el interlineado, y activa o desactiva la **Vista oscura**. Estos ajustes solo cambian la pantalla, nunca el libro, y se aplican a todos los libros.
- El punto donde dejó de leer se recuerda para cada archivo, en la carpeta de datos de la aplicación y no dentro del libro.
- **Buscar en el libro** (Ctrl+F) busca en todos los capítulos. Haga clic en un resultado para ir a él.
- Un enlace dentro del libro lleva al lugar al que apunta. Los enlaces web y de correo electrónico se abren en su navegador predeterminado; las demás direcciones no se abren.
- Los scripts propios del libro nunca se ejecutan y no se carga nada de internet. El sonido y el vídeo no se reproducen.

## Editar el texto

- Haga clic en un párrafo y escriba. Se pueden editar párrafos, títulos, elementos de lista, citas, celdas de tabla y pies de imagen. Las imágenes y la estructura de las tablas no.
- Al pegar solo se inserta texto sin formato.
- **Enter** divide un párrafo en dos y **Shift+Enter** inicia una línea nueva dentro de él. **Backspace** al principio de un párrafo lo une al anterior, y **Delete** al final le une el siguiente. En celdas de tabla, pies de imagen y listas de definiciones, Enter no hace nada: solo cambia el texto de dentro.
- **Negrita** (Ctrl+B) y **Cursiva** (Ctrl+I) se activan y desactivan. El texto que la hoja de estilos del libro pone en negrita o cursiva queda como está.
- **Deshacer** (Ctrl+Z) y **Rehacer** (Ctrl+Y) siguen funcionando después de guardar. Si deshace un cambio hecho en otro capítulo, el editor le lleva a ese capítulo.
- **Reemplazar** (Ctrl+H) recorre todo el libro, párrafo a párrafo: una coincidencia nunca abarca dos párrafos. Los capítulos de solo lectura se omiten y se indica cuántos lugares se han omitido. **Reemplazar todo** se deshace en un solo paso.

## Guardar

- Guardar (Ctrl+S), Guardar como (Ctrl+Shift+S, solo `.epub`), el **Guardado automático** de la cinta y la pregunta antes de cerrar funcionan igual que en los demás editores.
- Si no ha cambiado nada, el archivo no se vuelve a escribir. Al guardar cambios, solo se reescriben los párrafos que modificó. Las imágenes, fuentes, estilos y todas las demás partes del libro quedan exactamente como estaban. En un libro EPUB 3 también se actualiza la fecha de «última modificación».
- Si otro programa cambió el archivo después de que usted lo abriera, el archivo no se sobrescribe.

## Panel de IA

- Pregunte sobre el libro, pida un resumen de un capítulo o que se corrija o reescriba su texto. La IA lee la tabla de contenido y los capítulos del libro y encuentra texto en él.
- Los cambios de la IA aparecen al instante, y un solo deshacer (Ctrl+Z) revierte todo lo que cambió en ese turno. La IA puede poner texto en negrita o cursiva, pero no puede añadir imágenes, tablas ni capítulos.
- El texto del libro es material para la IA, no instrucciones para ella.
- Pida «Traduce este libro al francés» y la IA abrirá la ventana de traducción con ese idioma ya indicado. No se envía nada hasta que pulse **Empezar**.
- Los libros EPUB también se pueden adjuntar en el panel de IA de los demás editores, elegir con `@` y encontrar con la búsqueda de archivos de Inicio.

## Traducir un libro

1. En la pestaña **Inicio**, haga clic en **Traducir libro** (o Archivo ▸ Traducir libro…).
2. Elija el idioma, los capítulos (al principio están todos elegidos) y los resultados: un **Libro traducido**, un **Libro bilingüe** (original y traducción) o ambos. Elija dónde se guarda cada uno.
3. Haga clic en **Siguiente**. La confirmación muestra el número estimado de solicitudes a la IA, a qué IA van, las partes ya traducidas (que no se vuelven a enviar) y, en una conexión que se factura por uso, que se cobrará. Si el libro tiene cambios sin guardar, el botón es **Guardar y traducir**.
4. Haga clic en **Empezar**. El progreso y **Detener** aparecen arriba. La edición queda bloqueada hasta que termina la traducción; el panel de IA sigue funcionando.
5. Al terminar, un informe enumera lo que se tradujo, lo que quedó en el idioma original y los archivos resultantes, cada uno con **Abrir**.

- El libro en sí no cambia. Cada resultado es un nuevo archivo EPUB con identidad propia, de modo que las aplicaciones de biblioteca de libros electrónicos lo distinguen del original.
- El título y la tabla de contenido también se traducen. En un libro bilingüe, cada párrafo va seguido de su traducción; en tablas, pies de imagen y listas, la traducción va dentro de la misma celda o elemento. Su título muestra ambos, como «Título original (Título traducido)».
- Los capítulos que no eligió quedan en el idioma original en el resultado.
- Un libro escrito en vertical pasa a horizontal, salvo que se traduzca al japonés, al chino o al coreano. Las traducciones al árabe y al hebreo se leen de derecha a izquierda.
- Lo ya traducido se conserva. Si se detiene, elija **Exportar lo traducido hasta ahora** (el resto queda en el idioma original) o **Continuar más tarde**. Al abrir un libro con una traducción sin terminar, GenOffice ofrece continuarla. **Volver a traducir desde el principio** borra primero la traducción conservada para ese idioma.
- Las traducciones conservadas cuentan en Configuración ▸ General ▸ **Resultados de IA guardados**, junto con las de los documentos PDF, y **Eliminar todo** también las borra.
- La misma traducción también puede ejecutarse desde la [línea de comandos](help://cli) como `ieumoffice epub translate`.

## Todavía no disponible

- Añadir, eliminar o reordenar capítulos; cambiar el título, el autor o la portada; insertar imágenes o tablas; convertir un párrafo en título o en lista.
- Editar o traducir libros de diseño fijo, y abrir libros con protección anticopia.
- Pasar páginas como en un libro impreso, y crear un libro nuevo y vacío.
- Comparar el original y la traducción en paralelo dentro del editor. En su lugar, abra el libro bilingüe y corrija el libro traducido como cualquier otro libro.
- Ocultar partes de un libro a la IA.
