# Operación y mantenimiento

## Copias de seguridad

Cierra Cantera antes de copiar los datos. SQLite utiliza WAL: copiar únicamente `cantera.sqlite` mientras la aplicación sigue abierta puede perder operaciones recientes.

Copia la carpeta de datos completa y guárdala en un lugar privado:

- Ejecutando desde el código: `.data/` dentro de `cantera`, salvo que hayas definido `CANTERA_DATA_DIR`.
- Instalador de escritorio: carpeta `data` de la ubicación indicada en [escritorio.md](escritorio.md).
- Incluye los archivos de configuración de proveedores y `provider-key`; sin esa clave no se podrán descifrar las credenciales guardadas.

Para restaurar, cierra la aplicación, conserva primero una copia de sus datos actuales y sustituye la carpeta completa por el respaldo. No mezcles bases y claves de instalaciones diferentes. La copia contiene datos privados y cuentas: no la subas a GitHub. La cuenta local no se recupera mediante correo; conserva sus credenciales y respaldos.

## Docker opcional

Desde la carpeta `cantera`, con Docker y Compose disponibles:

```bash
docker compose up --build -d
```

Abre `http://127.0.0.1:3000`. El puerto se publica solo en el equipo y los datos quedan en el volumen `cantera_cantera-data`. El contenedor corre como un usuario sin privilegios. La imagen base está fijada por digest y las dependencias usan `npm ci`.

```bash
docker compose logs -f cantera
docker compose stop
```

Para copiar los datos con el servicio detenido:

```bash
docker compose stop
docker compose cp cantera:/app/.data ./respaldo-cantera
docker compose start
```

Mueve ese respaldo a una ubicación privada fuera del repositorio. `docker compose down` conserva el volumen; la opción `--volumes` lo elimina y no debe usarse si quieres preservar los datos. La configuración Compose incluida utiliza cuentas locales y comienza con proveedores ficticios; las claves reales se configuran por usuario en la aplicación.

## Desarrollo y comprobación

```bash
npm run setup
npm run dev
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

En una máquina Linux nueva, Playwright puede requerir bibliotecas del sistema; su instalador `npx playwright install --with-deps chromium` las prepara cuando tienes permisos administrativos. Los datos de prueba deben usar una carpeta temporal independiente de `.data/`.

El requisito de Node responde tanto al SQLite integrado como a las dependencias HTTP. Node documenta el cambio de disponibilidad de [SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html). Cantera recomienda Node 24 LTS y admite la rama 22 desde 22.19.

## Problemas habituales

| Síntoma                                              | Acción                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| El lanzador no encuentra Node                        | Instala Node 24 LTS con npm y abre una terminal nueva. El instalador de escritorio no lo necesita.                    |
| El puerto 3000 está ocupado                          | Ejecuta `npm run launch -- --port 3001`. En escritorio el puerto se elige automáticamente.                            |
| No abre el navegador                                 | Entra manualmente en la URL de la terminal. Puedes usar `--no-open`.                                                  |
| Dependencias de otro sistema                         | No copies `node_modules` entre equipos. Ejecuta `npm ci` en el sistema destino.                                       |
| Aparecen siempre los mismos negocios                 | Estás usando fixtures. Configura proveedores reales para consultar el nicho y lugar seleccionados.                    |
| Places/OpenAI devuelve un error                      | Verifica clave, API habilitada, facturación, cuotas y acceso a modelos en el proyecto correspondiente.                |
| No se encuentran mis datos después de mover carpetas | Revisa `CANTERA_DATA_DIR` y restaura el respaldo completo. Los datos de escritorio no están en la carpeta del código. |
| Olvidé la contraseña de una cuenta local             | No hay restablecimiento por correo en modo local. No borres la base para intentar recuperarla.                        |
| Falla una actualización desde el código              | Conserva `.data/` y `.env.local`, actualiza fuentes y lockfile, luego usa `npm run launch`.                           |
| macOS/Windows advierte del editor                    | Los paquetes carecen de firma comercial. Consulta la guía de distribución y utiliza una fuente de confianza.          |

## Qué valida cada entorno

El workflow `ci.yml` comprueba instalación, tipos, pruebas y build en Windows, macOS y Linux. Chromium comprueba el recorrido de la aplicación en Linux. `desktop.yml` construye los instaladores bajo demanda.

La validación de claves reales, consumo de APIs, SMTP, Supabase desplegado y firma de instaladores requiere los servicios y credenciales correspondientes. Una prueba fixture no valida estas integraciones externas. Revisa los resultados concretos de Actions antes de afirmar que una plataforma o instalador se ha verificado.
