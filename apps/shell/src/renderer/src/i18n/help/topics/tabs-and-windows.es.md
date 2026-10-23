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
- **Al reiniciar la aplicación sin archivo**, vuelve la última pareja de documentos divididos tal como estaba; al abrirla con un archivo, solo se abre ese archivo.
- Las pestañas Inicio, Ayuda y Presentación (vista previa) no pueden entrar en un panel; mientras una está abierta, los dos paneles se ocultan un momento y vuelven al regresar a una pestaña de documento.

Tres o más paneles, la división dentro de una ventana separada y la sincronización en vivo de las dos copias quedan para más adelante.
