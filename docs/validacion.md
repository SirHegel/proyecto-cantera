# Validación de la versión 1.0.0

Comprobación local en Linux con Node 24 y Chrome, 19 de septiembre de 2026.

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

La aplicación Electron se abrió en Linux: servidor integrado, registro, SQLite, aislamiento de la ventana y persistencia de sesión después de reiniciar. Los paquetes sin firma necesitan una prueba en los equipos donde se distribuyan. La construcción y la apertura automatizada en Windows y macOS se verifican por separado en el workflow de instaladores; consultar su ejecución concreta en [GitHub Actions](https://github.com/SirHegel/proyecto-cantera/actions).

La configuración de Docker se valida sintácticamente con `docker compose config`; no se ha ejecutado el contenedor localmente. El modo remoto Supabase y sus migraciones no se han probado contra un proyecto real en esta revisión. El modo local SQLite es el recorrido verificado de extremo a extremo.

Los informes del navegador se generan en `playwright-report/` y `test-results/`, excluidos de Git. `npm run test:e2e` usa una carpeta temporal diferente para no alterar los datos de la persona que ejecuta la prueba.
