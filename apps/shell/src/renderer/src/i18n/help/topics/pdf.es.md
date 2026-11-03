# PDF: lectura, anotación y censura

El editor de PDF tiene cinco pestañas en la cinta de opciones: **Inicio / Anotar / Editar / Páginas / Vista**. Lee y escribe: el texto es editable, el contenido se puede censurar y firmar, y los formularios se pueden rellenar.

## Lectura y navegación

- Barra lateral izquierda: **Miniaturas** (haga clic para saltar, el intervalo visible aparece resaltado) o **Esquema** (los marcadores, cuando existen).
- Zoom: el control de proporción de la esquina inferior derecha; ctrl+rueda ajusta el zoom por pasos.
- Mover la vista: active la **Herramienta Mano** (pestañas Inicio y Vista) y arrastre para mover la página en cualquier dirección. Mientras está activa, arrastrar no selecciona texto y un clic simple sigue abriendo los enlaces. Arrastrar con el botón central (rueda) pulsado mueve la vista sin la herramienta. Esc u otra herramienta la desactiva.
- Rotación: por página o de todas las páginas desde el menú Páginas; las rotaciones se vuelven a escribir al guardar.
- Búsqueda: ctrl+F en texto completo, con todas las coincidencias resaltadas.
- PDF cifrados: una solicitud de contraseña (en su propia ventana pequeña) los abre; la contraseña solo se usa en esta sesión. Puede editar y guardar un documento así; al guardar se conserva su contraseña. **Anotar → Proteger** establece, cambia o quita la contraseña y lo que pueden hacer los lectores.

## Selección de texto y marcado (Anotar)

Pruébelo en cualquier párrafo:

1. **Arrastre el ratón por encima de una frase**: al soltar, flota una barra de anotación sobre ella:

![La barra de anotación tras seleccionar texto](img/pdf-highlight.png)

2. Elija uno de los tres colores de **Resaltar**, o **Subrayar**, **Ondulado** o **Tachar**. Para cambiar un color de resaltado, haga clic derecho sobre él y elija otro. Tras subrayar, ondular o tachar, se abre una fila de colores en la barra: haga clic en otro color para cambiarlo; la próxima marca también usará ese color. **Preguntar a la IA** envía la selección junto con su pregunta al panel de IA.
3. Para deshacer una anotación, vuelva a seleccionar el mismo fragmento arrastrándolo y haga clic en el botón activo de la barra (un conmutador al estilo de Word), o selecciónelo y pulse Supr.

Referencia:

- Al arrastrar sobre texto aparece una barra emergente: **resaltar / subrayar / tachar / copiar / Preguntar a la IA**.
- Los colores salen de la paleta; **aplicar el mismo marcado a un intervalo ya marcado lo quita** (conmutador al estilo de Word).
- Los marcados ya guardados en el archivo se pueden seleccionar y borrar (menú ⋯ o Supr).
- **Nota**: mientras hay una herramienta de dibujo activada, la capa de texto no se puede seleccionar; la herramienta se desactiva sola tras cada colocación, así que vuelve al modo selección para la siguiente acción.

## Herramientas de dibujo (Anotar)

Seis herramientas: **Dibujar, Rectángulo, Elipse, Flecha, Nota**, más **Censurar área** en la pestaña Anotar.

- Cada herramienta es un conmutador: pulse para activarla; **se desactiva sola en cuanto se coloca una forma** (vuelva a pulsar la herramienta para seguir); pulsar la herramienta activa también la desactiva.
- El dibujo libre sigue el grosor del trazo; rectángulo/elipse/flecha se trazan arrastrando; los colores salen de la paleta de dibujo.
- Las formas colocadas se pueden seleccionar, borrar, arrastrar y (rectángulo/elipse) cambiar de tamaño.
- **La censura, el procedimiento completo** (para ocultar una línea de texto):

  1. Pestaña Anotar ▸ haga clic en **Censurar área** (la herramienta se activa).
  2. **Arrastre un rectángulo sobre el contenido**: queda cubierto por una marca rayada y la barra de herramientas gana los botones **borrar marcas / aplicar censura**.

  3. Haga clic en **Aplicar censura** y confirme: el resultado es una copia de trabajo en la que el texto y las imágenes cubiertos se han eliminado físicamente (no solo ocultos) y no se puede deshacer; el documento original queda intacto.

  ¿Se equivocó? El botón de borrar marcas elimina las marcas actuales para que pueda volver a dibujar.

## Notas adhesivas y cadenas de comentarios

- La **herramienta Nota** clava un chinchete y abre una tarjeta en el margen para ese texto (el nombre del autor es configurable); al confirmar, se guarda como una anotación de texto PDF estándar.
- Haga clic en un chinchete para abrir la cadena: **Responder** (las respuestas forman una sola lista plana, sin anidar), **Editar** su comentario, **Eliminar** un comentario o una cadena entera.
- Las ediciones en curso sobreviven hasta que el guardado escribe el texto nuevo en la misma anotación del archivo, con lo que se mantienen intactas las cadenas de respuestas.

## Editar el contenido del PDF (Editar)

- **Editar texto**: pulse el texto para editarlo bloque por bloque (motor pdfium; las fuentes se ajustan lo mejor posible).
- **Insertar texto**: coloque texto localizable con la fuente, el tamaño y el color que elija.
- **Insertar imagen / sello**.
- Formularios: los campos AcroForm se rellenan directamente; los valores se escriben al guardar.

## Firmas

- **Firma manuscrita**: dibújela; puede vincularse a un campo de firma de formulario.
- **Firma de imagen**: coloque una imagen como firma.
- Las firmas guardadas se pueden reutilizar.
- **Firma con certificado** (pestaña Anotar): firma con un certificado del almacén del sistema o un archivo .p12/.pfx; muestra opcionalmente la firma en la página y certifica opcionalmente el documento contra cambios posteriores.
- Firmar escribe siempre un **archivo nuevo** (actualización incremental — las firmas anteriores siguen válidas) y abre la copia firmada en su lugar. Guarda antes: una firma cubre el archivo tal cual está en disco.
- Un banner sobre el documento lista las firmas existentes; **Ver firmas** muestra la validez, cobertura y cadena de certificados de cada una. La revocación (CRL/OCSP) no se comprueba.

## Operaciones de página (Páginas)

- **Girar / eliminar / reordenar**: arrastre las miniaturas para reordenar; la eliminación pide confirmación.
- **Importar páginas**: arrastre páginas desde otro PDF. **Insertar página en blanco** añade una página vacía.
- **Reemplazar páginas** cambia un intervalo por páginas de otro documento; **Recortar páginas** recorta los bordes, con una opción para aplicarlo a todas las páginas.
- **Tamaño de página** reescala todas las páginas a un mismo tamaño de papel; **Invertir orden** da la vuelta al documento de principio a fin.
- **Extraer página**: exporte las páginas seleccionadas a un PDF nuevo.
- **Dividir PDF**: dos variantes — por intervalos en varios archivos, o cortar cada página en una cuadrícula de páginas más pequeñas.
- **Combinar PDF**: dos variantes — añadir otros PDF, o combinar varias páginas en una misma hoja. Los tamaños se suman **antes** de leer nada y **todo lo que supere 1 GiB en total se rechaza** con un error legible (así la memoria queda acotada).
- Los cambios a nivel de página se vuelven a escribir en el siguiente guardado; Guardar como deja el original intacto.

## Exportación e impresión

- **Exportar como Word… / PowerPoint… / Excel…** en el menú Archivo, o los mismos tres desde **Convertir PDF** en la cinta — todo local, sin subir nada. El .pptx sale con una diapositiva por página y el .xlsx con una hoja de cálculo por página. Cada uno pregunta dónde guardarlo.
- **Imprimir**: el orden y las rotaciones actuales a través del cuadro de diálogo del sistema; admite intervalos de páginas.

## Guardar

- El guardado normal o el autoguardado vuelven a escribir las anotaciones y las ediciones en el archivo (de forma atómica).
- **La censura pasa por su procedimiento de aplicación**, que produce una copia y deja el original intacto, para que el contenido sensible no quede en él.

## Atajos de la barra de selección

Mientras la barra de anotación está visible sobre el texto seleccionado, una sola tecla ejecuta una acción al instante.

| Tecla | Acción                                     |
| ----- | ------------------------------------------ |
| H     | Resaltar (quita el resaltado si ya existe) |
| U     | Subrayar                                   |
| S     | Tachar                                     |
| N     | Añadir una nota al final de la selección   |
| E     | Explicación de IA (tarjeta de pasaje)      |
| T     | Traducción de IA (tarjeta de pasaje)       |
| Intro | Abrir el cuadro **Preguntar a la IA**      |

- Las teclas funcionan igual con un método de entrada coreano o de cualquier otro idioma. Se ignoran mientras escribe en un campo o mantiene pulsado Ctrl o Alt.
- En un documento bloqueado para edición (su contraseña de propietario impide cambios), H, U, S y N no hacen nada y muestran el motivo, igual que los botones de la barra.

## Tarjetas de pasaje

Pulse **E** o **T**, o las fichas de explicar y traducir del cuadro **Preguntar a la IA**, y la respuesta aparecerá en una pequeña tarjeta junto a la selección. Las tarjetas se guardan, así que siguen ahí al volver a abrir el documento, y se pueden copiar. Si vuelve a preguntar por el mismo pasaje, se abre la tarjeta existente sin enviar nada.

- **Guardar como nota** crea una nota en ese lugar. Su primera línea dice «Explicación de IA» o «Traducción de IA» y el autor es el nombre de su cuenta del PC. Entra en el archivo al guardar el PDF; hasta entonces la tarjeta muestra «Pendiente de guardar».
- **Seguir preguntando en el panel de IA** pasa el pasaje y la respuesta al panel de IA sin enviarlos; **Añadir a la nota** los coloca al final de la nota de este PDF.
- Solo **Volver a generar** envía de nuevo el pasaje a la IA.
- **Eliminar** borra únicamente la tarjeta guardada. La nota que ya guardó se queda.
- Una línea punteada tenue marca cada pasaje que tiene tarjeta; al hacer clic en ella se vuelve a abrir. La línea solo existe en pantalla y nunca se guarda ni se imprime. Actívela o desactívela en Vista ▸ **Marcas de pasaje**.

## Resumen de anotaciones

- Vista ▸ **Anotaciones** muestra en la barra lateral izquierda una lista con los resaltados, subrayados, tachados, notas y dibujos del documento, las marcas aún sin guardar y las tarjetas de pasaje. Las marcas muestran el texto que cubren.
- Filtre por tipo, color, intervalo de páginas o texto, y ordene por página o por orden de creación.
- Al hacer clic en un elemento se salta a ese lugar con un breve parpadeo. Una nota abre su hilo en el margen; una tarjeta abre la tarjeta.
- Las opciones del menú **Copiar como Markdown**, **Abrir como documento Markdown** y **Abrir como documento de Word** usan la lista tal como está filtrada. No interviene la IA. Solo se pueden crear documentos nuevos desde un PDF abierto dentro de GenOffice.

## Traducción en paralelo

- Active Vista ▸ **Traducción en paralelo** y a la derecha de cada página aparecerá una columna de traducción que se desplaza con ella. Activarla no envía nada a la IA. Un documento que ya tradujo con **Traducir documento** muestra su traducción enseguida; los párrafos sin traducción se ven como texto original atenuado.
- **Traducir esta página** (o **Traducir el resto** si ya hay una parte hecha) envía la página con un solo clic mientras usa una suscripción; junto al botón figura el nombre de la IA a la que va. En una conexión que cobra por uso, el primer clic en una pestaña pregunta antes «cobrará por esto · Traducir / Cancelar».
- Haga doble clic en un párrafo traducido para editarlo. Los párrafos editados se guardan como texto sin formato y se usan tal cual en los archivos PDF, Markdown y EPUB traducidos. **Volver a traducir** en un párrafo envía solo ese párrafo y pregunta antes si lo había editado.
- Al pasar el ratón sobre un párrafo traducido se recuadra su lugar en la página original. El ancho y el tamaño de letra de la columna se pueden ajustar. **Traducir todas las páginas…** abre la ventana **Traducir documento**, cuyo formato **Solo guardar (sin archivo)** conserva la traducción sin escribir ningún archivo.
- Los párrafos traducidos de nuevo quedan enlazados frase por frase. Al pasar el ratón por una frase traducida se resalta esa frase en la página original, y al pasarlo por una frase original se ilumina su traducción. Donde la frase no se encuentra en la página, y en los párrafos traducidos antes o editados por usted, el enlace sigue siendo por párrafo.
- La barra sobre la columna cambia entre **Traducción** y **Explicación sencilla**. La explicación sencilla reescribe el texto con palabras cotidianas y frases cortas, para niños, personas mayores o quienes aprenden el idioma; los hechos, las cifras y los nombres se mantienen. La elección se recuerda y cambiar no envía nada. Mientras se muestra la explicación, los botones de página y de párrafo y la edición actúan sobre ella.
- En la explicación sencilla, **Explicar todas las páginas de forma sencilla…** abre la ventana **Traducir documento** con el modo **Explicación sencilla**. Una explicación es más larga que el original, así que no puede ser un PDF traducido; se escribe en Markdown o EPUB. Con **Original y luego explicación** activado, cada párrafo original va seguido de su explicación; desactivado, el archivo solo lleva la explicación. El idioma es al principio el de la interfaz y puede ser el del propio documento.

## Resaltado con IA

- En Inicio ▸ **Resaltado con IA**, elija un conjunto de categorías (Investigación e informes, Contratos y condiciones, Libros de texto y manuales, o Personalizado) y las páginas. No se envía nada hasta que revise el número estimado de llamadas y la IA de destino y pulse **Empezar**.
- Las frases que elige la IA se previsualizan como recuadros de color translúcidos sobre la página. La vista previa nunca se guarda; actívela o desactívela en Vista ▸ **Vista previa de resaltados**.
- En el panel **Anotaciones**, pulse **Aceptar** o **Descartar** en cada sugerencia, o acepte una categoría completa. Una frase que no se encontró en el texto de la página no se puede aceptar.
- Una sugerencia aceptada se convierte en un resaltado del color de su categoría, y el nombre de la categoría se guarda como asunto de la anotación, de modo que otros visores de PDF lo muestran en su lista de comentarios. Entra en el archivo al guardar el PDF.
- El resaltado con IA no puede iniciarse en un documento bloqueado para edición. Las frases inventadas que no están en el texto se descartan, y el informe final indica cuántas se recibieron y cuántas se descartaron.

## Resumen del documento y citas de párrafo

- En la parte superior del panel de IA, **Resumen del documento** ▸ **Crear resumen general** produce un resumen en tres líneas, un resumen y términos clave (con su significado y la primera página). Un documento largo se resume por partes, por eso primero confirma el número estimado de llamadas.
- El resumen se guarda y sigue ahí al volver a abrir; solo **Volver a generar** envía de nuevo. Al hacer clic en un término se busca en el documento; cada sección se puede copiar o añadir a la nota.
- Cuando la conversación está vacía, el panel de IA ofrece tres preguntas sugeridas. Al hacer clic en una se envía una vez.
- Al hacer clic en un enlace de página (p.N) que la IA da como prueba, se salta a esa página y la frase citada se resalta durante dos segundos. Si no se encuentra la frase, solo se va a la página.

## Una nota para cada PDF

- La primera vez que pulse **Abrir nota** (pestaña Vista o panel **Anotaciones**) se abre un cuadro de guardado, por defecto en la carpeta del PDF con el nombre «nombre del PDF nota.md». Después, la nota se abre directamente en una pestaña de Markdown.
- Si elige un archivo que ya existe, Windows puede preguntar si quiere reemplazarlo, pero el archivo no se sobrescribe: queda vinculado como nota tal como está.
- **Añadir a la nota** (en tarjetas, elementos del panel y el resumen del documento) coloca una cita y un enlace de página al final de la pestaña de la nota y lo deja sin guardar; usted guarda en la pestaña de la nota. El enlace abre el PDF en esa página en otros programas, como un navegador.
- Un PDF que nunca se guardó muestra «Guarda primero el PDF». Las notas solo funcionan con PDF abiertos dentro de GenOffice.
