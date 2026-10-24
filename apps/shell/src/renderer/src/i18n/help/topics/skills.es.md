# Habilidades

Una habilidad es un conjunto de instrucciones de trabajo para la IA. Anote una sola vez algo que hace una y otra vez —los pasos para ordenar las notas de una reunión, el tono de un informe, los puntos que hay que revisar cada vez— y podrá llamarla en el panel de IA, o la IA la usará por su cuenta cuando venga al caso. Una habilidad es una carpeta con un archivo `SKILL.md` en un formato abierto, así que una habilidad creada en GenOffice también funciona tal cual en Claude Code o Codex.

## Activar y desactivar habilidades

**Configuración ▸ Habilidades** muestra las habilidades de este PC, agrupadas según su origen. Cada habilidad aparece con su nombre, como la muestran los agentes de programación. Use el cuadro de búsqueda de arriba para encontrar una por nombre o descripción.

| Origen                               | Qué contiene                                                     | Al principio |
| ------------------------------------ | ---------------------------------------------------------------- | ------------ |
| **Integradas**                       | Las 5 habilidades que vienen con GenOffice                       | Activadas    |
| **Mis habilidades**                  | Las habilidades que usted añadió o creó (`~/.ieumoffice/skills`) | Activadas    |
| **Carpeta de habilidades de Claude** | Las habilidades de `~/.claude/skills`                            | Desactivadas |
| **Complementos de Claude**           | Las habilidades de los complementos de Claude instalados         | Desactivadas |
| **Carpeta de habilidades de Codex**  | Las habilidades de `~/.agents/skills`                            | Desactivadas |

- El interruptor activa o desactiva una habilidad. El mismo ajuste vale para el panel de IA de todos los editores, para Ask AI en Inicio y para la ventana del agente.
- Para una habilidad activada, elija **Decide la IA** o **Solo cuando se llama**. Al principio está en Decide la IA. Con Solo cuando se llama, la habilidad solo se usa cuando usted mismo la llama.
- Habilidades de orígenes distintos pueden tener el mismo nombre. La etiqueta de origen de cada fila las distingue.
- El menú de más opciones tiene **Ver contenido**, **Editar** (solo mis habilidades), **Exportar (zip)** (solo mis habilidades) y **Abrir carpeta**.
- **Mover a la papelera** lleva una de mis habilidades a la papelera del sistema, desde donde puede restaurarla.
- Una habilidad integrada se oculta en lugar de eliminarse: elija **Ocultar**. **Volver a mostrar**, al final de la lista, la recupera tal como era al principio.
- Para cambiar una habilidad integrada o una de otro programa, elija **Copiar a mis habilidades**. La copia aparece en mis habilidades y la original se desactiva.
- Al exportar una habilidad con plantilla, el documento de plantilla también va en el zip. Compruebe que el documento no contenga información personal antes de exportarlo.

## Añadir una habilidad

1. En **Configuración ▸ Habilidades**, haga clic en **Añadir**.
2. Elija **Desde una carpeta**, **Desde un archivo zip** o **Desde un enlace de GitHub**. Para GitHub, escriba la dirección de un repositorio público o `owner/repo` y haga clic en **Buscar**.
3. Revise en la vista previa las habilidades encontradas. Muestra el número y el tamaño de los archivos, si hay scripts, las direcciones web que aparecen en el texto y el archivo de licencia.
4. Marque solo las habilidades que quiera instalar y haga clic en **Instalar**. Las habilidades instaladas quedan activadas desde el principio.

Debajo de la vista previa siempre se lee: «Instala habilidades solo de fuentes de confianza. Una habilidad da instrucciones a la IA y, en la ventana del agente, puede ejecutar scripts.» Lea una habilidad de origen desconocido antes de instalarla.

- Si mis habilidades ya tiene una con el mismo nombre, elija **Reemplazar** u **Omitir** en esa fila.
- Al descargar desde GitHub, GenOffice solo se conecta a `github.com`, `api.github.com` y `codeload.github.com`, y no envía ningún dato de inicio de sesión. Si el archivo comprimido es demasiado grande o no supera las comprobaciones de seguridad, no se instala nada.
- **Nueva habilidad** abre un editor vacío donde usted mismo escribe el nombre, la descripción y las instrucciones.

## Buscar actualizaciones

- En una habilidad instalada desde GitHub, **Buscar actualizaciones** en el menú de más opciones comprueba si hay contenido nuevo. Solo se contacta con GitHub cuando usted hace clic.
- Si no ha cambiado nada, aparece «Está al día». Si algo cambió, revise los archivos cambiados y la vista previa, y haga clic en **Actualizar**.
- Si usted editó la habilidad después de instalarla, también aparece «Se perderán tus propios cambios».
- Al actualizar se conservan el estado activado o desactivado de la habilidad y la elección entre Decide la IA y Solo cuando se llama.

## Llamar a una habilidad en el panel de IA

1. Escriba `/` o `$` al principio del cuadro de entrada de la IA o justo después de un espacio. Aparece la lista de habilidades activadas.
2. Siga escribiendo para acotar la lista. Por ejemplo, `/meet` encuentra `meeting-minutes`. También sirven las palabras de la descripción, así que `/acta` funciona igual.
3. Elija una con las flechas y pulse Intro o Tab. La habilidad se convierte en una ficha encima del cuadro de entrada.
4. Escriba lo que quiere y envíelo. GenOffice añade el contenido de la habilidad a la solicitud.

- En el panel de IA de Excel, `$` solo abre la lista al principio del todo del cuadro de entrada, para no estorbar en direcciones de celda como `$A$1`.
- Puede añadir varias fichas y quitar una con ×. Esc solo cierra la lista; no detiene una ejecución de la IA.
- **Gestionar habilidades…**, al final de la lista, abre **Configuración ▸ Habilidades**.
- Las fichas se quedan en el mensaje enviado y en el chat guardado. Cuando vuelve a abrir un chat y envía de nuevo, se vuelve a leer el contenido actual de la habilidad. Una habilidad que entretanto se eliminó o se desactivó aparece como «No disponible» en su ficha.
- Si el texto de las habilidades que se envía junto es demasiado largo, aparece «Las habilidades son demasiado grandes para enviarlas» y no se envía nada.

## Habilidades que la IA usa por su cuenta

- De las habilidades activadas y configuradas con Decide la IA, la IA recibe los nombres y las descripciones en forma de lista. Cuando una encaja con la solicitud, la IA toma su contenido y la usa.
- Cuando la IA usa una habilidad, el chat dice «Se usó la habilidad 〈nombre〉».
- La IA decide a partir de la descripción si usa una habilidad. Una descripción que diga en qué casos debe usarse la habilidad le ayuda a elegir bien.

## Crear una habilidad pidiéndola

1. En el panel de IA, diga algo como «Guarda lo que acabamos de hacer como habilidad» o «Crea una habilidad que redacte los informes con nuestro estilo de la casa».
2. La IA extrae los pasos y las reglas que vale la pena repetir y muestra una tarjeta **Nueva habilidad**. Los valores usados solo esta vez, como nombres y fechas, quedan fuera de las instrucciones.
3. Revise y edite el nombre, la descripción y las instrucciones en la tarjeta. El nombre es lo que muestra la lista de habilidades y lo que se escribe después de `/`: letras minúsculas del alfabeto inglés, dígitos y guiones.
4. Haga clic en **Guardar**. La nueva habilidad se añade a mis habilidades, queda activada y aparece enseguida en la lista de `/`.

- No se escribe ningún archivo hasta que hace clic en **Guardar**. Si hace clic en **Cancelar**, el chat la conserva solo como «Propuesta de habilidad sin guardar».
- También puede pedir que se cambie una habilidad existente, por ejemplo «Cambia la habilidad de actas a nuestra manera de hacerlas». La tarjeta se titula entonces **Cambiar habilidad**. Una de mis habilidades se sobrescribe con **Reemplazar**; una habilidad integrada o de otro programa se guarda como copia en mis habilidades y la original se desactiva.

## Añadir un documento como plantilla

Cuando crea una habilidad en el panel de IA de un editor, el documento actual puede ir con ella como plantilla. Marque **Guardar también este documento como plantilla** en la tarjeta y el botón se convierte en dos.

- **Crear una plantilla en blanco**: se abre una copia del documento en una pestaña nueva, «Vista previa de la plantilla - 〈título〉», y la IA de esa pestaña vacía los valores rellenados, como nombres, fechas e información personal. Revise la pestaña, cambie más cosas a mano si hace falta y haga clic en **Guardar esta pestaña como plantilla**; la pestaña tal como está en ese momento pasa a ser la plantilla.
- **Guardar el documento tal cual**: guarda el documento actual como plantilla sin cambios. Si el documento tiene partes que usted ocultó a la IA, este botón queda bloqueado, para que el contenido oculto no acabe tal cual en la plantilla.
- La plantilla se guarda como copia del documento dentro de la carpeta de la habilidad. El documento original no cambia.

## Usar una habilidad con plantilla

- Una habilidad con plantilla muestra **Incluye plantilla** en la lista.
- Llámela como ficha y envíe: se abre una copia de la plantilla como documento nuevo sin título, y la IA de esa pestaña continúa con su solicitud. El panel original conserva «Se trabaja con la plantilla en una pestaña nueva» e **Ir a la pestaña**.
- Cuando la IA elige por su cuenta una habilidad con plantilla, no se abre ninguna pestaña de inmediato. En su lugar, el chat muestra un botón **Abrir un documento nuevo con esta plantilla**.
- Normalmente usted elige dónde va el documento nuevo la primera vez que lo guarda. Los editores de Markdown y HTML guardan en la carpeta predeterminada como siempre. El archivo de plantilla en sí se queda como estaba.

## Habilidades con scripts

- En el panel de IA normal y en Ask AI de Inicio, los scripts de una habilidad nunca se ejecutan. Solo el texto de la habilidad llega a la IA.
- Una habilidad con scripts muestra **Incluye scripts · funciona por completo en la ventana del agente**, y al añadirla como ficha aparece «Los scripts de esta habilidad no se ejecutan en el panel de IA normal». El envío no se bloquea.
- Para usar también los scripts, llame a la habilidad en la ventana del agente. Consulte [Modo agente](help://agent-mode).

## Habilidades integradas

| Habilidad         | Qué hace                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `meeting-minutes` | Convierte las notas de una reunión en un acta que muestra las decisiones y las tareas       |
| `internal-comms`  | Redacta avisos, boletines, informes de avance, preguntas frecuentes y otros textos internos |
| `humanizer`       | Busca las expresiones que suenan escritas por una IA y las vuelve naturales                 |
| `copy-editing`    | Repasa un texto en inglés ya escrito para hacerlo más claro y conciso                       |
| `find-skills`     | Busca en la ventana del agente las habilidades que necesita y propone instalarlas           |

`copy-editing` está pensada para textos de marketing en inglés. `find-skills` solo funciona en la ventana del agente.

## En la ventana del agente

- La ventana del agente sigue los mismos ajustes de activación de **Configuración ▸ Habilidades**, y en su cuadro de entrada las habilidades se llaman igual, con `/` o `$`.
- Las habilidades de `.claude/skills` y `.agents/skills` de la carpeta del proyecto se usan en esa sesión sin necesidad de activarlas.
- La lista de habilidades queda fijada al iniciar la sesión. Si activa o desactiva habilidades durante una sesión, aparece «Las habilidades modificadas se aplican a partir de la próxima sesión».
- Cuando el agente crea una habilidad, aparece la misma tarjeta en la ventana. Para la plantilla, elija entre los documentos abiertos en pestañas y los archivos de la carpeta del proyecto.
- Cuando el agente encuentra una habilidad que vale la pena instalar, aparece una propuesta de instalación. Ábrala con **Abrir vista previa** y haga clic usted mismo en **Instalar**; si no, no se instala nada. Una habilidad instalada está disponible a partir de la próxima sesión.
