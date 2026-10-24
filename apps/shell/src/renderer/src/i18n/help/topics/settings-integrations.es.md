# Configuración, idioma, tema e integraciones MCP

## Abrir la configuración

La fila de la parte inferior izquierda de Inicio abre el panel de configuración (muestra «Conectar IA» hasta que hay una IA conectada). Tiene cinco secciones: Cuenta, IA, General, Integraciones y Acerca de.

**Cuenta** muestra en qué estado están sus suscripciones de Claude y Codex, y **Gestionar conexiones** lleva a la sección IA. La IA tiene sus propios artículos: [Conexión por suscripción](help://subscription) y [Modelos de IA y ajustes](help://ai-models).

## Idioma

- La configuración ofrece **21 idiomas de interfaz**: inglés, chino simplificado, japonés, coreano, francés, alemán, español, tailandés, indonesio, ruso, árabe, portugués, italiano, polaco, checo, neerlandés, malayo, hebreo, hindi, chino tradicional, vietnamita.
- El cambio se aplica de inmediato y se conserva; la barra de menús nativa se reconstruye con el idioma.

## Tema

Claro / Oscuro / Seguir el sistema. «Seguir el sistema» sigue la apariencia del sistema operativo, y los editores cambian de aspecto en sincronía sin parpadeos.

## General

- **Posición de la barra lateral de IA** (izquierda o derecha), **Tamaño del texto del panel de IA** y **Corrección ortográfica en el chat de IA**.
- **Abrir el panel de IA en documentos nuevos** — desactivado, un documento nuevo empieza con el panel plegado, a un clic de distancia.
- **Guardar automáticamente todos los documentos** activa el guardado automático de forma predeterminada en todos los editores; todavía puedes desactivarlo para una ventana.
- **Ubicación de guardado** con un botón **Cambiar** y **App predeterminada para documentos de Office** para reclamar .docx / .xlsx / .pptx para GenOffice.

GenOffice no recopila ni envía estadísticas de uso, así que no hay ningún interruptor para ello.

## IA ▸ Avanzado

Permanece cerrado hasta que se abre; la mayoría nunca lo necesita. La pestaña **Modelo de IA** contiene las claves de API y los servidores propios, para el chat. En la pestaña **Medios de IA y búsqueda**, cada capacidad elige el proveedor que la sirve, y la clave y la URL base de un proveedor se introducen una vez y se comparten:

- **Búsqueda web**, **Generación de imágenes**, **Análisis de imágenes** y **Análisis de vídeo**, cada una con un proveedor, un modelo, una clave y una URL base.
- La **búsqueda de archivos local** corre en esta máquina. Debajo, el **reranking de búsqueda Jev** está **desactivado por defecto**. Al activarlo, los extractos de los 20 primeros aciertos locales — hasta 1.200 caracteres por documento, más nombres de archivos y carpetas — van al punto final de decisión que elijas (Jev vía OpenRouter o TypeSafe, Perplexity, Liquid AI d1, Cloudflare, un motor local o una URL propia) para reordenarlos por relevancia. Desactivado, nada deja el dispositivo.
- **Permitir que las solicitudes automáticas usen una suscripción** está **desactivado por defecto**. Decide si una solicitud que llega de la línea de comandos o de un agente de codificación conectado puede usar tu suscripción de Claude o Codex; véase [Conectar un agente de programación](help://mcp).

## Acerca de

- **Versión**, la dirección del proyecto en GitHub y una línea que nombra el proyecto de código abierto en el que se basa esta aplicación.
- **Canal de actualización**: Estable o Beta. Cambiarlo surte efecto de inmediato y busca una actualización; no bajará una instalación Beta a Estable.

## Aplicaciones predeterminadas

La configuración puede registrar GenOffice como programa predeterminado para .docx / .xlsx / .pptx / .pdf y formatos similares (registro de aplicación predeterminada a nivel de plataforma; confirme cuando se le pida).

## Avisos de software de terceros y actualizaciones

- Ayuda ▸ Avisos de software de terceros: el inventario completo de licencias de código abierto que se distribuye con la aplicación.
- Menú (☰) ▸ Buscar actualizaciones (en un Mac, Ayuda ▸ Buscar actualizaciones): lanza una comprobación manual; si hay una versión más reciente, ofrece instalarla.

## Integración MCP (para usuarios avanzados / clientes de IA)

**Integraciones** es el panel que conecta GenOffice con un agente de programación, y tiene su propio artículo: Conectar un agente de programación. La versión corta: elija una vía (la línea de comandos o MCP), siga esa sección y después abra una conversación nueva y pregunte.

En **Servidor HTTP local**, la aplicación también puede ejecutar el servidor por su cuenta —un interruptor de activación y un puerto— y **Avanzado** añade la URL de comprobación de estado y el archivo de registro, en lugar de dejarlo en manos del asistente. Solo escucha en localhost.

## Chuleta de la línea de comandos

| Comando             | Qué hace                      |
| ------------------- | ----------------------------- |
| `ieumoffice <file>` | abrir un archivo              |
| `ieumoffice mcp`    | iniciar el servidor MCP local |
| `ieumoffice --help` | todos los comandos y opciones |
