# Instalación de GenOffice

Cada versión se publica en la [página de versiones](https://github.com/pblsketch/openoffice/releases/latest) del proyecto en GitHub. Esta versión se publica para Windows.

## Elija el archivo para su equipo

| Plataforma  | Requisitos                                   | Archivo                         |
| ----------- | -------------------------------------------- | ------------------------------- |
| **Windows** | Windows 10 o posterior, Intel/AMD de 64 bits | `GenOffice-Setup-<version>.exe` |

Las versiones anteriores siguen en la página de versiones.

## En Windows

1. Descargue `GenOffice-Setup-<version>.exe` desde la página de versiones.
2. Ejecútelo. El instalador no está firmado digitalmente, así que Windows puede mostrar primero una ventana azul «Windows protegió su PC». Elija **Más información** y después **Ejecutar de todas formas**. El texto exacto depende de su versión de Windows.
3. Siga el instalador hasta el final.

Coloca GenOffice en el menú Inicio y registra `.docx`, `.xlsx`, `.pptx`, `.pdf` y formatos similares como aplicaciones predeterminadas, de modo que al hacer doble clic en un archivo este se abra en GenOffice.

Como el instalador no está firmado, ejecute solo uno que haya descargado de la página de versiones indicada arriba.

## Actualizaciones

- GenOffice busca una versión más reciente en la misma página de versiones de GitHub. Cuando se publica una, **Configuración ▸ Acerca de** la ofrece: pulse **Actualizar a …**, espere a que termine la descarga y pulse **Reiniciar e instalar**.
- **Menú (☰) ▸ Buscar actualizaciones** hace la comprobación cuando usted lo pida. En un Mac es **Ayuda ▸ Buscar actualizaciones**.
- Cuando la comprobación falla —no hay red, o aún no se ha publicado nada—, no ocurre nada y la aplicación sigue funcionando como antes.
- **Canal de actualización**, también en Configuración ▸ Acerca de, es Estable o Beta. Cambiarlo surte efecto de inmediato y busca una actualización; no bajará una instalación Beta a Estable.
- Las actualizaciones tampoco están firmadas digitalmente. Antes de instalar una, la aplicación compara el archivo descargado con la suma de comprobación publicada con esa versión.

## La compilación que está ejecutando

**Configuración ▸ Acerca de** es donde la aplicación informa de la versión que tiene, del canal que sigue y de dónde vive el proyecto. También nombra el proyecto de código abierto en el que se basa esta aplicación.

## La línea de comandos viene incluida

Cada instalación trae un comando `ieumoffice` que habla con los mismos motores que la ventana, de modo que ambos nunca discrepan sobre un archivo. `ieumoffice install-cli` lo pone en su `PATH`. Vea [Línea de comandos y agentes](help://cli) para saber qué puede hacer.
