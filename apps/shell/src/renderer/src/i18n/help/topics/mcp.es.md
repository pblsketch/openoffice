# Conectar un agente de codificación

GenOffice habla el Model Context Protocol, de modo que un agente de codificación puede leer, escribir y renderizar sus documentos con los mismos motores que usa la aplicación. El agente no está adivinando un formato de archivo: recibe los esquemas tipados de las op a partir de las mismas definiciones contra las que valida el executor.

## Registrarlo desde la aplicación

**Configuración ▸ Integraciones** es el sitio donde se hace esto. El panel tiene dos mitades, y puede usar una o las dos.

**El skill.** Una fila por cada agente de codificación que se encuentre en este equipo —Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf—, cada una con **Instalar**, **Actualizar** y **Desinstalar**, más **Instalar en otra carpeta…**, **Descargar skill (zip)** y **Copiar ruta**. Si su asistente no aparece en la lista, señale a GenOffice una carpeta desde la que lea `SKILL.md`, o guarde el zip y deje que el asistente lo instale. El skill y el MCP pueden convivir: el asistente elige uno, y hacen exactamente lo mismo.

**MCP.** Se ofrecen dos vías: **Iniciado por el asistente (recomendado)**, donde añade la configuración que se muestra a su cliente y el asistente arranca el servidor por su cuenta, y el **Servidor HTTP local**, que la aplicación ejecuta por usted. De cualquier manera, el asistente acaba hablando con GenOffice y usted nunca escribe una orden.

## Registrarlo desde la línea de comandos

Lo mismo desde una terminal: esta es la vía avanzada, y la que conviene usar cuando el agente está en un sitio donde el panel no puede encontrarlo:

```sh
ieumoffice mcp install all
```

Encuentra los agentes de codificación de este equipo y escribe la entrada del servidor stdio en la configuración de cada uno, dejando el resto del archivo tal como lo encontró. La entrada se llama `ieumoffice`. Hecho a mano para Claude Code, el mismo registro es `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`.

```sh
ieumoffice mcp list             # where each agent stands
ieumoffice mcp install cursor    # just one
ieumoffice mcp uninstall cursor  # take it back out
```

Un agente instalado en un sitio poco habitual necesita `--dir <path>`; `--force` reescribe una entrada que ya está ahí.

`ieumoffice mcp --help` reúne en una pantalla todo lo que acepta el servidor: las formas de registro, eliminación y listado, el servicio por HTTP y las dos opciones de esquema.

## Ejecutarlo sin asistente

Para un cliente en otro equipo, sírvalo por HTTP en su lugar:

```sh
ieumoffice mcp --http 8765 --token <secret>
```

`--host <addr>` cambia dónde escucha. Pásele al cliente el mismo token.

Por HTTP también viajan los archivos: `PUT /files/<name>` sube uno, cada herramienta acepta una URL `http(s)` en lugar de una ruta, y las salidas vuelven como URL de descarga y, cuando son lo bastante pequeñas, como recursos incrustados. Las ops, las especificaciones y el Markdown se pasan en línea en ambos casos.

## Qué recibe el agente

Cada orden es una herramienta. Las interesantes:

- **`docs`, `sheet`, `slides`** — leer y editar un archivo por la ruta de escritura de la propia aplicación, una **op** cada vez. Una presentación nueva sigue `deck_start`, `deck_page`, `deck_build`.
- **`render`** — un PNG por página, maquetado por el renderizador de la aplicación, para que el agente mire una diapositiva en vez de adivinarla.
- **`pdf`** — la capa de texto de un PDF, página a página, sin proceso de la aplicación.
- **`info`** — metadatos y un resumen de la estructura, normalmente la primera llamada más barata sobre un archivo desconocido.
- **`search`, `image`, `media`** — búsqueda web y de imágenes, generación de imágenes y análisis de medios a través de lo que esté configurado en la aplicación, así que el agente no necesita sus propias claves. La sección siguiente dice qué pueden usar.
- **`merge`** — rellenar una plantilla `{{key}}`.

## Búsqueda, imágenes y medios: qué puede usar un agente

Una solicitud que llega del comando `ieumoffice` o de un cliente MCP no la ha escrito usted en la aplicación, así que GenOffice la trata con cuidado.

- **La búsqueda** funciona siempre y es gratuita de forma predeterminada. La clave de un proveedor de búsqueda solo se usa si usted seleccionó una.
- **Generar una imagen** necesita la clave de un proveedor de imágenes. En esta versión una suscripción no genera imágenes.
- **Describir una imagen** usa un proveedor con clave cuando hay uno configurado. Su suscripción de Claude o Codex **no se usa a menos que usted lo permita**.
- **El vídeo y el audio** necesitan un proveedor con clave que admita vídeo.

Para permitir el uso de la suscripción, abra Configuración ▸ IA ▸ **Avanzado** y active **Permitir que las solicitudes automáticas usen una suscripción**. Antes aparece una advertencia —«No hay límite por hora: un programa puede enviar tantas solicitudes como quiera, y estas pueden incluir todo el texto de un documento e imágenes de sus páginas. Ninguna de las dos empresas recomienda que un programa use tu suscripción automáticamente, y tu cuenta podría quedar restringida.»— y el interruptor solo se activa después de pulsar **Activar de todos modos**.

Incluso con el interruptor activado:

- Las solicitudes se atienden de una en una. Las demás esperan su turno.
- No hay límite por hora. El turno pasa de una solicitud a otra, no de una tarea a otra, así que una traducción larga de un PDF se alterna con las demás llamadas en lugar de bloquearlas. Un interruptor activado con la advertencia anterior se ha desactivado: lea la nueva advertencia y vuelva a activarlo.
- Un inicio de sesión de pago por consumo que usted permitió con **Usar de todos modos** no cuenta aquí como suscripción. Se trata como una clave: si lo eligió como IA que se usa, las descripciones de imágenes pasan por él diga lo que diga el interruptor, y cada una se factura.

Con el interruptor desactivado y sin ninguna clave configurada, la herramienta responde que la función no está disponible y nombra este ajuste. Un agente puede comprobarlo antes con la herramienta `capabilities`; vea [Línea de comandos y agentes](help://cli).

## Esquemas y un presupuesto más pequeño

`apply` y `create` anuncian sus parámetros `ops`, `cells` y `data` con el esquema tipado de cada op, generado a partir de `ieumoffice guide <domain> --json`. Es preciso y no es pequeño. Un cliente con la ventana de contexto apretada puede pedir matrices sencillas en su lugar:

```sh
ieumoffice mcp --compact-schemas
GENOFFICE_MCP_COMPACT_SCHEMAS=1 ieumoffice mcp
```

## Por qué el skill

Un agente que no conoce el vocabulario de las ops adivinará. El skill lleva la referencia y las guías de diseño —el mismo material que imprime `ieumoffice guide`—, de modo que el asistente escribe ops cuya especificación realmente ha leído. Instálelo desde el panel de arriba, o con `ieumoffice skill` desde una terminal.

## Qué alcanza en la aplicación

El servidor no se limita a los archivos del disco. Mientras GenOffice está en marcha, el agente también puede trabajar a través de la ventana:

- **`open_in_genoffice`** abre un archivo en una pestaña y le da el foco.
- **`open_documents`** enumera todos los documentos que tiene abiertos —id, tipo, ruta y si tienen cambios sin guardar— y después lee el contenido actual de uno, lo guarda en su sitio o lo cierra, guardando antes salvo que le pida que lo descarte.
- **Las herramientas de contenido** toman ese id (o la ruta) como argumento `document`, así que una edición cae en la pestaña que ya tenía abierta y la ventana cambia para mostrarla.

Dos cosas quedan fuera de alcance: no hay panel de IA, y el diálogo de actualización dentro de la aplicación no se aplica.

## El panel Servidor HTTP local

En **Servidor HTTP local**, la aplicación ejecuta el servidor por su cuenta en lugar de dejarlo en manos del asistente: un interruptor de activación, un campo **Puerto**, un indicador **En ejecución / Detenido** y la **Generación en segundo plano** (escribir los documentos directamente en una ruta sin abrir la interfaz) y el **Ejemplo de configuración del cliente** para copiar. Al abrir **Avanzado** se añaden las dos URL de conexión —Streamable HTTP y la antigua de SSE—, una URL de **Comprobación de estado** y un interruptor de **Registro** que anota la actividad del servidor y de las herramientas en un archivo local que usted puede **Abrir**, **Actualizar** o **Borrar** desde ahí. Solo escucha en localhost.
