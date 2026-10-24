# Pestañas y gestión de ventanas

Todos los archivos abiertos comparten una sola ventana; la barra de pestañas de arriba permite pasar de uno a otro al estilo de un navegador.

![La barra de pestañas: Inicio más dos documentos](img/tabs.png)

## Fundamentos

- **Cambiar**: haga clic en una pestaña, pulse **Ctrl+Tab** (siguiente) / **Ctrl+Mayús+Tab** (anterior), o gire la rueda sobre la barra.
- **Cerrar**: la × de la pestaña, o ⌘W/ctrl+W. Si hay cambios sin guardar, pregunta primero.
- **Nuevo**: el + al extremo derecho de la barra.
- **La activación es inmediata**: al pulsar una pestaña ya se cambia, sin esperar a que termine el clic.

## Cambiar nombre: haga doble clic en una pestaña

**Haga doble clic en cualquier pestaña de archivo** y el título se convierte en un campo de texto en el sitio: Intro confirma, Esc cancela, la pérdida de foco confirma; la Intro que confirma un candidato del IME no se confunde con una confirmación. El cambio de nombre pasa por las mismas comprobaciones de seguridad que el de una fila de la pantalla de inicio (caracteres no permitidos, conflictos de nombre), renombra el archivo en el disco y actualiza la lista de recientes.

## Arrastrar para reordenar

Mantenga pulsada una pestaña y arrástrela de lado a lado para reordenarla; las vecinas se apartan en vivo y el orden queda fijo al soltar. Una zona muerta de 4 píxeles evita que un clic normal desplace las pestañas.

## Menú contextual

Con el botón derecho en una pestaña: **Abrir en una ventana nueva** — disponible en cada pestaña de documento que se pueda separar — y **Cerrar**, que aparece atenuado en una pestaña que no se pueda cerrar. Ambas siguen el idioma de la aplicación.

## Separar en una ventana

**Arrastre una pestaña fuera de la barra** (o use Abrir en una ventana nueva) y se convierte en su propia ventana con el documento vivo; arrástrela de vuelta para acoplarla de nuevo a la barra. Una ventana separada es una ventana equivalente: puede seguir editando y guardando allí.

## La lista de todas las pestañas

Cuando las pestañas desbordan, el pequeño icono de la barra de pestañas en el extremo derecho abre la lista completa (un menú nativo, nunca tapado por el área de contenido); elija con las flechas.

## La barra de herramientas de cada editor

Cada pestaña de editor tiene una barra de herramientas arriba (la disposición exacta varía algo según el editor):

- **Guardar** (⌘S/ctrl+S) y **Guardar como**.
- **Deshacer / Rehacer**: en varios niveles; cada editor mantiene su propio historial.
- **Buscar** (ctrl+F): abre el panel de búsqueda de ese editor.
- Interruptor de **Autoguardado**: activado, los cambios se escriben en el disco a intervalos; desactivado, solo se escribe al guardar a mano (el distintivo de cambios sin guardar en la pestaña o el título se lo recuerda).

## La pestaña Inicio

La pestaña Inicio de la izquierda no se puede cerrar; para volver desde cualquier editor, haga clic en ella o use Archivo ▸ **Volver al inicio**.

## Vista dividida: dos paneles

**Arrastre una pestaña al borde derecho de la ventana**: la pestaña lo sigue como una pequeña copia flotante, cerca del borde aparece el aviso «Dividir aquí» y, al soltarla, quedan dos paneles lado a lado. Si la suelta en el borde inferior, quedan dos paneles apilados. El menú contextual de la pestaña ofrece lo mismo con **Dividir a la derecha** y **Dividir abajo**, y **Quitar división** en una pestaña que está en un panel.

- La pestaña arrastrada queda en el panel donde la soltó; el otro panel conserva el documento que estaba viendo justo antes.
- Si solo hay un documento abierto, se coloca una copia del mismo documento en ambos paneles, para ver el principio y el final a la vez. Un documento nuevo sin guardar también se puede dividir.
- Arrastre el **separador** entre los paneles para cambiar su proporción, haga doble clic para dejarla mitad y mitad, o empújelo hasta un extremo para cerrar ese panel; el documento sigue abierto como pestaña.

## Una sola ventana de IA que sigue el foco

- Solo se ve una ventana de IA. El panel en el que trabaja muestra la suya; la del otro panel se repliega en un riel, y al hacer clic en un panel su ventana de IA pasa al frente.
- Mientras está replegada, la conversación de ese panel y el trabajo de IA en curso siguen vivos. Las conversaciones se guardan por documento.
- **Dos copias del mismo documento**: después de guardar en un panel, guardar desde el otro pregunta primero «Este documento cambió en otro lugar». El guardado automático espera en silencio.
- Tras un cierre normal, **al reiniciar la aplicación sin archivo** vuelve la última pareja de documentos divididos tal como estaba; al abrirla con un archivo, solo se abre ese archivo. Tras un apagado repentino, las pestañas anteriores vuelven como se describe más abajo.
- Las pestañas Inicio, Ayuda y Presentación (vista previa) no pueden entrar en un panel; mientras una está abierta, los dos paneles se ocultan un momento y vuelven al regresar a una pestaña de documento.

Tres o más paneles, la división dentro de una ventana separada y la sincronización en vivo de las dos copias quedan para más adelante.

## Cuando la aplicación o el PC se apagan de repente

Mientras un documento tiene cambios sin guardar, GenOffice guarda una copia de recuperación cada 30 segundos aproximadamente en la carpeta de datos de la propia aplicación. Lo hacen todos los editores, también con un documento nuevo que nunca se ha guardado. Su archivo no cambia hasta que guarde.

- **Sus pestañas vuelven**: si la aplicación o el PC se apagaron sin cerrarse con normalidad (un corte de luz, un fallo, la aplicación cerrada a la fuerza, el PC apagado o reiniciado por una actualización), las pestañas de documentos que estaban abiertas vuelven la próxima vez que inicie GenOffice, en el mismo orden y con la vista dividida si la tenía. También ocurre si la inicia abriendo un archivo.
- **Una sola lista en Inicio**: los documentos que aún tienen contenido sin guardar aparecen juntos en la pantalla de Inicio. Elija **Restaurar** o **Descartar** para cada uno, o use **Restaurar todo** o **Descartar todo**, y pulse **Aceptar**. Si otro programa o un servicio de sincronización cambió el archivo después, **Descartar** aparece seleccionado al principio para que el archivo se quede como está. Si ya no se encuentra el archivo original, al restaurarlo el contenido se abre como un documento nuevo sin título.
- **Decidir más tarde**: cerrar la lista no borra nada. La primera vez que abra uno de esos documentos, un cuadro con su nombre volverá a preguntar; pulsar Esc o cerrar el cuadro lo restaura. Si no necesita el contenido restaurado, cierre el documento con **No guardar**.
- **Las pestañas se cargan al abrirlas**: las pestañas restauradas muestran su título enseguida, pero cada documento se carga solo cuando hace clic en su pestaña por primera vez. Abrirlo todo a la vez podría hacer que un PC con poca memoria se apagara otra vez.
- **Al apagar el PC**: si hay documentos sin guardar, GenOffice no pregunta si quiere guardarlos. Conserva las copias, se cierra y las ofrece en el siguiente inicio.
- **Documentos sin copia**: los archivos de Excel, HWP y PDF protegidos con contraseña no tienen copia de recuperación, así que sus cambios sin guardar no se pueden restaurar; un aviso lo indica una vez al abrir un documento así. Guárdelos a menudo. Los documentos de Word y PowerPoint con contraseña tienen una copia bloqueada con la misma contraseña.
- **Archivos CSV, .xls antiguos y .tsv**: el editor de hojas de cálculo guarda su copia como un libro sin título. Al restaurarla se abre como un libro sin título, y al guardarla por primera vez se propone la carpeta y el nombre del archivo original como .xlsx.

Una copia se borra cuando guarda el documento, lo cierra con **No guardar** o elige **Descartar**, y también tras 30 días sin cambios. Después de un cierre normal, GenOffice se inicia como antes y no recupera pestañas.

**Esto no es el autoguardado.** El autoguardado escribe los cambios en el propio archivo, y solo después de haberlo guardado una vez. Una copia de recuperación nunca toca su archivo; solo conserva lo que aún no ha guardado, hasta que lo guarde o lo descarte.
