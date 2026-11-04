# Diagramas: dibujar y editar archivos draw.io

El editor de diagramas abre archivos draw.io en una pestaña. En él dibuja diagramas de flujo, diagramas de arquitectura y otros diagramas, los guarda en el formato en que venían, los exporta como imagen o PDF y deja que la IA los lea, los cambie y los dibuje. El editor funciona por completo en su PC.

## Abrir un diagrama

- El editor abre archivos `.drawio`, `.dio`, `.drawio.svg` y `.drawio.png`: desde el cuadro de diálogo de apertura, arrastrando un archivo a la ventana, desde los archivos recientes, el árbol de carpetas o (para `.drawio` y `.dio`) la lista de Google Drive. En Windows, al instalar GenOffice este pasa a ser el programa de los archivos `.drawio` y `.dio`.
- Un archivo `.drawio.svg` o `.drawio.png` solo se abre si el diagrama está guardado dentro de la imagen. Una imagen SVG o PNG normal no se abre como diagrama. Los archivos dañados tampoco se abren, y se muestra el motivo.
- Un archivo de Visio (`.vsdx`) se importa como un diagrama nuevo sin título. Al guardar por primera vez se propone un archivo `.drawio` en la carpeta del archivo de Visio, y el archivo de Visio no se modifica. Si algunas imágenes no se pudieron convertir, el editor indica cuántas. En Windows, los archivos `.vsdx` solo aparecen en «Abrir con».
- Un diagrama nuevo y vacío se crea con el mosaico **Diagrama** de Inicio o con Nuevo en el menú Archivo.
- Si el diagrama ya está abierto, su pestaña pasa al frente.

## Editar

- La pantalla de edición es la de draw.io tal cual: los menús arriba, las formas a la izquierda, el panel de formato a la derecha y las pestañas de página abajo.
- Guardar (Ctrl+S), Guardar como (Ctrl+Shift+S) e Imprimir (Ctrl+P) los gestiona GenOffice. Cambiar de pestaña y los demás atajos de la aplicación siguen funcionando. Todos los demás atajos son del propio editor, incluido deshacer (Ctrl+Z).
- **Ayuda** (F1), en los menús del editor, abre esta página.
- El editor usa el idioma de GenOffice. Al cambiar de idioma, el editor se reinicia: los cambios sin guardar se conservan, pero se pierde el historial de deshacer.
- El editor sigue el tema de GenOffice. Con el tema oscuro, el dibujo también se muestra en colores oscuros, pero el archivo guardado, los PNG, los PDF y las impresiones son idénticos a los del tema claro.

## Guardar

- Guardar, Guardar como, el **Autoguardado** de la barra de estado y la pregunta antes de cerrar funcionan igual que en los demás editores.
- Un diagrama se guarda en el formato con el que se abrió. Guardar como ofrece `.drawio`, `.dio`, `.drawio.svg` y `.drawio.png`. Un diagrama nuevo se guarda primero como `.drawio`.
- Si no ha cambiado nada, el archivo no se vuelve a escribir. Las páginas guardadas comprimidas en el archivo siguen comprimidas.
- La imagen de un archivo `.drawio.png` muestra la primera página; el diagrama completo va guardado dentro.
- Mientras un diagrama tenga cambios sin guardar, se mantiene una copia de recuperación en la carpeta de datos de la aplicación, para que el trabajo no se pierda si hay un bloqueo.

## Exportar e imprimir

- Elija la exportación a PNG, SVG o PDF en el menú Archivo (las opciones de exportación de los menús del editor abren la misma ventana). Después elija **Todas las páginas** (la opción predeterminada) o **Solo la página actual**.
- Con todas las páginas, PNG y SVG generan un archivo por página, llamado `<nombre>-p<número de página>`. Un PDF tiene una hoja por página, con el tamaño de página definido en el diagrama.
- Imprimir (Ctrl+P) también imprime una hoja por página. Las exportaciones y las impresiones usan siempre colores claros, sea cual sea el tema.

## Panel de IA

- Pida a la IA que dibuje un diagrama de flujo, un diagrama de secuencia o un organigrama, que explique el diagrama, que ordene una página o que añada el paso siguiente después de las formas seleccionadas.
- La IA lee el diagrama como texto: las páginas y, de cada forma y cada conector, su id, su texto, su forma, su posición y sus conexiones, además de qué formas ha seleccionado usted. No ve el diagrama como imagen.
- Los cambios de la IA aparecen al instante. Cada cambio es un paso de deshacer (Ctrl+Z), y la lista de turnos del panel revierte un turno completo de la IA. Si se rechaza cualquier parte de un cambio, el diagrama queda como estaba.
- Para un diagrama de flujo nuevo, un diagrama de secuencia o algo parecido, la IA escribe Mermaid y GenOffice lo convierte en formas en su PC. La disposición puede variar un poco respecto a la que genera el sitio web de draw.io.
- Los diagramas también se pueden adjuntar en el panel de IA de los demás editores, elegir con `@` y encontrar con la búsqueda de archivos de Inicio. Los [comandos de terminal](help://cli) también leen, editan y crean diagramas (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Uso de internet

- La pestaña de diagrama no envía nada a internet. El editor funciona con archivos instalados junto con GenOffice, y su almacenamiento en la nube, el uso compartido, los complementos y su propia IA están desactivados.
- Las imágenes y fuentes que un diagrama toma de internet no se cargan; un aviso lo indica al abrir el archivo. Un enlace web o de correo electrónico en una forma se abre en su navegador predeterminado solo cuando hace clic en él.
- El bloc de notas, las bibliotecas de formas que añada y los colores recientes se quedan en este PC, en la carpeta de datos de la aplicación. El panel de IA envía el texto del diagrama a la IA que haya elegido, igual que en los demás editores.

## No disponible

- Insertar o editar PlantUML. Las formas PlantUML de un archivo se muestran como su imagen guardada.
- Los diseños automáticos que usan ELK y los conectores que rodean las formas. Esos conectores se dibujan como conectores normales.
- Los formatos antiguos de Visio (`.vsd`, `.vss`) y guardar de nuevo como `.vsdx`.
- El almacenamiento en la nube, el uso compartido, la publicación, los complementos y las funciones de IA propias del editor.
- Ocultar partes de un diagrama a la IA.
