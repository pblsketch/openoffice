# Edición conjunta en tu red

Las personas de la misma red (LAN) pueden abrir juntas un documento, editarlo a la vez y ver los cursores y los nombres de los demás. No hay servidor ni cuenta: el PC que comparte el documento lleva la sesión, y solo ese PC guarda el archivo.

## Compartir un documento

1. Abre el documento y haz clic en **Colaborar** en la barra de herramientas del editor.
2. Escribe **Mi nombre** y elige **Mi color**. Los demás los ven junto a tu cursor.
3. Haz clic en **Empezar a compartir**. Aparecen un **PIN** de 6 dígitos y la **Dirección de este PC**.
4. Dile el PIN a quienes se vayan a unir, y también la dirección si no encuentran el documento.

Si el documento tiene cambios sin guardar, guárdalo primero. Los documentos protegidos con contraseña no se pueden compartir. **Nuevo PIN** le da al documento un PIN nuevo; quienes ya se unieron siguen dentro.

Para terminar, vuelve a abrir **Colaborar** y haz clic en **Dejar de compartir**. Todas las personas que se unieron conservan una copia sin guardar en su PC.

## Unirse

1. En cualquier editor, haz clic en **Colaborar** y cambia a **Unirse**.
2. Elige el documento en **Encontrados** o escribe la dirección del PC que comparte en **Dirección**.
3. Introduce el PIN y haz clic en **Unirse**. El documento compartido se abre en una pestaña nueva.

Mientras participas, la persona que comparte es quien guarda el archivo. Tu Guardar no hace nada y te lo indica, y la pestaña nunca pide que la guardes al cerrarla. **Salir** te saca de la sesión. Cuando la sesión termina, la pestaña sigue abierta como una copia sin guardar que puedes guardar donde quieras.

## Editar juntos

- El cursor o la selección de cada persona se muestra en su color, con su nombre.
- Deshacer solo revierte tus propias ediciones.
- Algunas funciones están desactivadas durante una sesión, por ejemplo las que cambian partes del documento distintas de su contenido. El editor te avisa cuando rechaza una.
- En el editor Hangul solo edita la persona que comparte. Quienes se unen ven los cambios en directo.
- Los archivos de texto sin formato y JSON se abren en la vista de código del editor Markdown y todavía no se pueden compartir.

## Seguridad

- El PIN nunca se envía por la red. Se comprueba mediante un intercambio de claves, y todo lo que viene después va cifrado. Otras personas de la red no pueden leer el documento, las ediciones ni el PIN.
- Tras 5 PIN incorrectos desde un mismo PC, ese PC tiene que esperar 10 minutos. Tras 20 PIN incorrectos en total, cada documento compartido recibe un PIN nuevo y se avisa a la persona que comparte.
- Hasta 16 personas pueden unirse a un documento.
- Mientras compartes, tu nombre y el título del documento se anuncian en la red para que otros puedan encontrarlo.
- La primera vez que compartas, el Firewall de Windows puede pedir permiso. Permítelo en redes privadas. Si lo bloqueas, los demás PC no podrán conectarse.
