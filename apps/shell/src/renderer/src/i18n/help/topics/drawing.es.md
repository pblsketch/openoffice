# El editor de dibujos

El editor de dibujos abre los dibujos de Excalidraw en una pestaña propia y los guarda en el mismo archivo.

- **Qué abre**: las notas de dibujo hechas con el plugin Excalidraw de Obsidian (`.excalidraw.md`, o un `.md` cuyo front matter tiene `excalidraw-plugin`) y los archivos `.excalidraw` de la aplicación web de Excalidraw.
- **Dibujo nuevo**: la tarjeta **Dibujo de Excalidraw** de Inicio, o **Archivo ▸ Nuevo**. Un dibujo nuevo es una nota de dibujo de Obsidian (`.excalidraw.md`), y le pone nombre al guardarlo por primera vez.
- **Dibujar**: formas, flechas, líneas, dibujo a mano alzada y texto, con la barra de herramientas y los atajos propios del lienzo. ctrl+Z deshace.
- **Guardar**: ctrl+S. Un archivo se guarda en el formato con el que se abrió. El autoguardado escribe cada 30 segundos y cuando la ventana pierde el foco, pero se salta un dibujo que aún no tiene nombre de archivo. Un dibujo que solo ha mirado se guarda byte a byte tal como estaba.

## Notas de dibujo de Obsidian

- Al guardar solo se reescriben la lista de textos de la nota y los datos del dibujo. El front matter, el texto que escribió en la nota y sus enlaces quedan como estaban, así que la nota se abre igual en Obsidian.
- Las imágenes a las que apunta la nota (`[[imagen.png]]` bajo Embedded Files) se muestran cuando están dentro de la bóveda de la nota: la primera carpeta por encima de la nota que tiene una carpeta `.obsidian`, o si no la propia carpeta de la nota. No se muestran las imágenes de más de 20 MB, las de carpetas ocultas ni las que están fuera de la bóveda.
- Todavía no se pueden añadir imágenes nuevas a una nota. La herramienta de imagen está desactivada y soltar archivos en el lienzo está bloqueado, porque una imagen guardada solo dentro de la nota podría no verse en Obsidian.

## Lo que todavía no hace

- No hay panel de IA. La IA no puede leer ni cambiar los dibujos.
- No hay exportación a PNG ni a SVG.
- El editor no usa la red. Sus fuentes vienen integradas, y las bibliotecas compartidas, la colaboración en directo y el contenido web incrustado están desactivados. Un enlace de un dibujo solo se abre en el navegador cuando es una dirección web o de correo.

## Abrir dibujos desde el Explorador de archivos

El instalador añade la aplicación a **Abrir con** para los archivos `.excalidraw`, sin convertirla en el programa predeterminado. Una nota de dibujo es un archivo `.md`, así que se abre en cualquier lugar donde se abre un archivo Markdown en la aplicación y va al editor de dibujos en lugar del editor Markdown.
