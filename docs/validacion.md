# Validación de Cantera

## Versión 1.0.1

La [verificación de la versión 1.0.1](https://github.com/SirHegel/proyecto-cantera/actions/runs/35478460426) terminó correctamente en Windows, macOS y Linux: 31 pruebas, TypeScript y compilación, además de tres escenarios de navegador con Chromium. El código verificado corresponde al commit `1aa46baa85fccfd2ea3413ba7cde7b4ec6657d83`.

La [ejecución final de instaladores 1.0.1](https://github.com/SirHegel/proyecto-cantera/actions/runs/35478708074) también terminó correctamente en las cuatro variantes: Windows x64, macOS Intel, macOS Apple Silicon y Linux x64. Cada ejecutable empaquetado superó el recorrido completo de persistencia descrito abajo. Esta ejecución usa el commit `4e010cd`, que añade documentación y una espera de la pantalla de acceso a la prueba, sin cambiar el código del producto respecto a `1aa46ba`. Los cinco archivos publicados proceden de esta ejecución.

En Linux se amplió la prueba del ejecutable de escritorio: registra una cuenta, ejecuta una búsqueda demo, genera un ángulo y mensaje, cambia el estado a Contactado, guarda una nota y cierra completamente la aplicación. Con el proceso cerrado, lee `userData/data/cantera.sqlite` y comprueba oferta, búsqueda, cliente, estado, nota, mensaje y seguimiento. Al volver a abrir, los datos siguen accesibles desde la interfaz y el CSV.

La prueba también reproduce Contactado → Sin contactar → Contactado y verifica que al volver a Sin contactar desaparece el recordatorio anterior. Falló con el instalador 1.0.0 en ese punto y pasó con la corrección. Para comprobar el historial paginado añade ocho búsquedas sintéticas únicamente a su perfil temporal y recupera la búsqueda original desde la segunda página después de reiniciar.

El mismo recorrido ampliado pasó en el archivo AppImage 1.0.1 descargable de Linux, usando `APPIMAGE_EXTRACT_AND_RUN=1` para el entorno sin FUSE. Se mantienen los límites del sandbox de automatización descritos en este informe.

Las pruebas de proveedores verifican la escritura y reproducción de cassettes dentro de la carpeta privada del usuario y el envío de `store: false` a OpenAI. Usan respuestas HTTP simuladas, sin llamadas de pago. El almacenamiento de trabajo es local; el modo real requiere servicios externos y no se declara retención externa cero.

Los límites de firma, instalación y sandbox indicados abajo siguen aplicándose. Las pruebas usan perfiles temporales y no modifican los datos de la persona que ejecuta Cantera.

## Versión 1.0.0

Comprobación local en Linux con Node 24 y Chrome, 19 de septiembre de 2026.

La [ejecución de integración continua](https://github.com/SirHegel/proyecto-cantera/actions/runs/35471887563) completó correctamente instalación, TypeScript, 29 pruebas y compilación en Windows, macOS y Linux, además del recorrido Chromium en Linux.

| Comprobación                                                | Resultado                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| TypeScript y compilación de producción                      | Correctos, sin avisos de trazado de archivos privados                                         |
| Pruebas de datos, cuentas, cuotas, extracción y proveedores | 29 pruebas correctas                                                                          |
| Pruebas de navegador                                        | 3 escenarios correctos                                                                        |
| Flujo comercial                                             | Registro, búsqueda demo, evidencia, ángulo, mensaje, estado, nota, CSV, logout y nuevo acceso |
| Aislamiento                                                 | Una segunda cuenta no ve ni exporta los leads de la primera                                   |
| Interfaz                                                    | Sin desbordamiento horizontal en cinco pantallas a 390, 768 y 1440 px                         |
| Accesibilidad                                               | Sin infracciones WCAG A/AA detectadas por axe en el panel móvil probado                       |
| Dependencias                                                | npm audit sin vulnerabilidades conocidas en el lockfile revisado                              |

Las pruebas de proveedores usan el SDK de OpenAI y respuestas HTTP simuladas para verificar contratos, paginación, errores, timeouts y citas. No se han hecho llamadas facturadas: la disponibilidad real de una cuenta de Google/OpenAI y sus cuotas debe comprobarse con sus credenciales.

La [ejecución de instaladores](https://github.com/SirHegel/proyecto-cantera/actions/runs/35471890787) completó las cuatro variantes: Windows x64, macOS Intel, macOS Apple Silicon y Linux x64. Cada trabajo construyó y abrió su ejecutable empaquetado en un runner nativo, comprobando registro, SQLite, aislamiento de la ventana y persistencia de sesión después de reiniciar. Las dos ejecuciones de CI verificaron el código del commit `a6ab118970db39adfbdb36fbcd9400b4f59a1395`.

Además, el archivo AppImage descargable se abrió y comprobó localmente en Linux. El paquete `.deb` se inspeccionó, sin instalarlo en el sistema. Las pruebas de CI abren los ejecutables empaquetados: no recorren los asistentes de instalación de Windows ni montan las imágenes DMG. Los paquetes sin firma necesitan una comprobación de instalación en los equipos donde se distribuyan.

Las pruebas de apertura usan Playwright Electron, que añade `--no-sandbox` al proceso de automatización. Verifican el aislamiento de Node de la ventana, pero no el sandbox del sistema operativo. La apertura directa del AppImage en este Linux requiere FUSE2 y una configuración de sandbox compatible; estos requisitos no estaban disponibles. En Debian/Ubuntu se recomienda el `.deb`, cuyo instalador configura el sandbox. La aplicación distribuida no desactiva el sandbox por defecto.

La configuración de Docker se valida sintácticamente con `docker compose config`; no se ha ejecutado el contenedor localmente. El modo remoto Supabase y sus migraciones no se han probado contra un proyecto real en esta revisión. El modo local SQLite es el recorrido verificado de extremo a extremo.

Los informes del navegador se generan en `playwright-report/` y `test-results/`, excluidos de Git. `npm run test:e2e` usa una carpeta temporal diferente para no alterar los datos de la persona que ejecuta la prueba.
