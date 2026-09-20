# Tus datos y el seguimiento de clientes

Cantera guarda la cuenta y el CRM de la aplicación de escritorio en tu computadora. Puedes cerrar y volver a abrir la aplicación para continuar con la misma cuenta y sus datos. No se crea una cuenta de CRM en la nube ni se sincronizan equipos automáticamente.

Descarga el instalador de tu sistema desde [la última versión pública de Cantera](https://github.com/SirHegel/proyecto-cantera/releases/latest). Esta guía describe el código actual; revisa las notas de la versión descargada para conocer las funciones que incluye.

## De una búsqueda a un contacto

1. En **Buscar clientes**, define tu oferta, nicho, ubicación e idioma y comienza la búsqueda.
2. Revisa los resultados y guarda las oportunidades que quieras trabajar. Aparecerán en **Mis leads**.
3. Usa **Sin contactar** cuando todavía no hayas escrito a ese negocio. **Listo para contactar** sirve para indicar que ya preparaste tu propuesta. Ambos aparecen en **Por contactar**.
4. Genera un borrador si lo necesitas y contacta por tu canal habitual. Cantera no envía el mensaje por ti.
5. Después de escribirle, cambia el estado a **Contactado**. Queda en **Esperando respuesta** y se programa el primer seguimiento para dentro de tres días.
6. Registra las respuestas, notas y avances en la ficha. En **Seguimientos**, **Ya le escribí** registra un seguimiento realizado; después del primero se propone otro seis días más tarde y no se programa un tercero automáticamente.

No marques Contactado solo por guardar el negocio o copiar su mensaje: el estado refleja lo que tú registras, no una confirmación de envío del proveedor de correo.

## Corregir un estado

Si marcaste un contacto por error, abre su ficha y selecciona **Sin contactar**. Cantera elimina su próxima fecha de seguimiento y reinicia el contador. El negocio sigue guardado y conserva notas, mensajes e historial de cambios. El mismo reinicio ocurre al cambiar a **Listo para contactar**.

Los estados **Respondió**, **Demo enviada**, **En conversación**, **Cerrado** y **Descartado** también limpian la fecha pendiente al seleccionarlos. Puedes consultar la actividad de la ficha para recordar lo que hiciste.

## Volver a una búsqueda anterior

En **Buscar clientes → Historial de búsquedas** verás el total guardado y las búsquedas más recientes. La lista muestra ocho por página. Usa **Anterior** y **Siguiente** para recorrerla y pulsa una búsqueda para abrir sus resultados.

Cambiar de página no elimina registros. El historial incluye búsquedas completadas, en proceso o pendientes de revisión; su estado aparece junto a la ubicación y fecha. Los datos temporales de proveedores pueden caducar aunque la búsqueda permanezca en el historial.

## Dónde se guardan

| Instalación     | Carpeta de datos habitual                                                         |
| --------------- | --------------------------------------------------------------------------------- |
| Windows         | `%APPDATA%\Cantera\data`                                                          |
| macOS           | `~/Library/Application Support/Cantera/data`                                      |
| Linux           | `~/.config/Cantera/data`, o la ubicación de configuración definida por el sistema |
| Desde el código | `.data/` dentro del proyecto, salvo que definas `CANTERA_DATA_DIR`                |

Dentro de esa carpeta:

| Archivo o carpeta                          | Contenido                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `cantera.sqlite`                           | Cuentas, búsquedas, negocios guardados, notas, mensajes generados, estados, fechas y actividad del CRM. |
| `cantera.sqlite-wal`, `cantera.sqlite-shm` | Archivos auxiliares que SQLite puede usar mientras la aplicación está abierta.                          |
| `providers/`                               | Configuración de proveedores y claves cifradas por usuario.                                             |
| `provider-key`                             | Clave local necesaria para descifrar la configuración.                                                  |
| `.cassettes/`                              | Respuestas grabadas cuando se utiliza el modo cassette de pruebas.                                      |

El modo cassette del escritorio escribe dentro de `data/.cassettes/`, no en la carpeta del programa instalado. Al ejecutar desde el código sin `CANTERA_DATA_DIR`, los cassettes quedan en `.cassettes/` en la raíz del proyecto. El modo de ejemplo no requiere grabaciones ni claves.

Las contraseñas de las cuentas se guardan como hashes; las claves de proveedores se cifran. Esto no cifra toda la base del CRM ni sus cassettes. Mantén protegidos el usuario del sistema y sus copias de seguridad.

## Qué sale del equipo

| Función                                                  | Procesamiento                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Crear cuenta local, guardar una nota o cambiar un estado | Se guarda en la instalación local.                                                                                     |
| Buscar o redactar con datos de ejemplo                   | Usa los ejemplos incluidos; no llama a Google Places ni OpenAI.                                                        |
| Buscar negocios reales                                   | Google Places procesa la consulta, ubicación e idioma con tu clave.                                                    |
| Leer las webs de esos negocios                           | Cantera realiza solicitudes a los sitios correspondientes.                                                             |
| Analizar o redactar con IA real                          | OpenAI procesa la oferta, datos del negocio, extractos o contexto necesario para esa función.                          |
| Usar una instalación configurada con Supabase            | Las cuentas y el CRM se almacenan en el proyecto Supabase elegido; es una configuración distinta del escritorio local. |

Las llamadas de Cantera a OpenAI usan `store: false` para desactivar el almacenamiento de respuestas para su recuperación mediante la API. No significa procesamiento local ni garantiza que el proveedor conserve cero datos. Consulta sus [controles de datos oficiales](https://developers.openai.com/es-419/api/docs/guides/your-data). Las políticas y la conservación de Google, OpenAI y los sitios consultados quedan fuera del control del CRM local.

La opción **Ayúdame a definirlo** usa el modo de IA elegido en Configuración. Si está activado el modo real, esa ayuda consulta OpenAI aunque después hagas una búsqueda de ejemplo. Para probar también esa ayuda sin APIs, conserva el modo de demostración en Configuración.

## Conservar tus datos al actualizar o cambiar de equipo

Cierra Cantera y copia la carpeta de datos completa a una ubicación privada. Incluye la base, la configuración y `provider-key`; copiar únicamente el archivo SQLite mientras está abierto puede omitir escrituras recientes. Sigue el [procedimiento de copia y restauración](operacion.md).

Actualizar el programa y conservar sus datos te permite continuar con tu cuenta. Instalarlo en otra computadora empieza una instalación independiente: no recupera tus datos por conocer el correo. No hay recuperación de contraseña por email en modo local. La exportación CSV sirve para consultar contactos, pero no sustituye el respaldo completo del CRM.
