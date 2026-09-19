# Aplicación de escritorio

## Instaladores

Electron incluye el navegador y Node necesarios para ejecutar Cantera. El usuario final abre un instalador, crea una cuenta local y usa la aplicación. El servidor solo escucha en `127.0.0.1`; se inicia y detiene con la ventana.

Los cinco archivos de la versión 1.0.0 están disponibles en la [Release de Cantera](https://github.com/SirHegel/proyecto-cantera/releases/tag/v1.0.0), junto con `SHA256SUMS.txt` para comprobar su integridad. Las descargas requieren acceso al repositorio privado. Puedes distribuir los instaladores directamente sin compartir el código ni las cuentas de desarrollo.

En Debian/Ubuntu, se recomienda instalar el paquete `.deb` con el gestor de paquetes: incluye la configuración de integración y sandbox. En otras distribuciones Linux, da permiso de ejecución al AppImage desde las propiedades del archivo; requiere FUSE2 y un sistema compatible con el sandbox de Chromium. Si falta FUSE, `APPIMAGE_EXTRACT_AND_RUN=1 ./Cantera-1.0.0-linux-x86_64.AppImage` evita el montaje, pero no resuelve restricciones del sandbox. Si este falla, utiliza un paquete instalado compatible con tu distribución.

Los paquetes actuales usan Electron 44 y requieren Windows 10 o posterior, o macOS 13 Ventura o posterior; estos mínimos corresponden a los [cambios de compatibilidad oficiales](https://www.electronjs.org/docs/latest/breaking-changes). Linux necesita un escritorio x64 y las bibliotecas gráficas del sistema. No se generan paquetes de 32 bits.

El empaquetado usa [electron-builder](https://www.electron.build/docs/) y el servidor [standalone de Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output). Sus archivos se copian a recursos externos al ASAR. `scripts/prepare-desktop.mjs` excluye configuración privada, SQLite y cassettes del paquete.

## Construcción local

Requisitos del desarrollador: Node 24 LTS, npm e internet durante instalación y empaquetado. El entorno gráfico es necesario para abrir la ventana Electron.

```bash
npm ci
npm run desktop
```

Para generar instaladores en `dist/`:

```bash
npm run desktop:dist
```

Para producir una carpeta ejecutable sin instalador:

```bash
npm run desktop:pack
```

El proceso compila Next.js, prepara `.desktop/server` y construye el paquete para el sistema actual. No incluyas archivos de `dist/` o `.desktop/` en commits. Cambia `version` en `package.json` y actualiza el lockfile antes de publicar una nueva versión.

## Construcción en GitHub

Ejecuta [Actions → Instaladores de escritorio](https://github.com/SirHegel/proyecto-cantera/actions/workflows/desktop.yml) → **Run workflow**. Cada trabajo instala desde el lockfile, comprueba tipos y pruebas, compila, abre la aplicación para verificar registro y persistencia y publica un artefacto descargable:

- Windows x64: instalador NSIS `.exe`.
- macOS Intel y Apple Silicon: imágenes `.dmg` separadas, construidas en el host de la arquitectura correspondiente.
- Linux x64: `.AppImage` y `.deb`.

La [matriz de runners oficiales de GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) permite generar cada paquete en su sistema nativo. Los artefactos de este workflow se conservan 30 días. Para una descarga permanente, adjunta los paquetes verificados a una Release del repositorio.

El workflow genera artefactos, no publica una Release ni firma automáticamente. Revisa su resultado y prueba el instalador antes de distribuirlo. Compilar en un runner no sustituye una comprobación de instalación en una máquina de usuario.

## Firma y avisos del sistema

Los paquetes actuales son para distribución sin firma comercial. Windows puede mostrar un aviso del editor; macOS puede bloquear una aplicación sin notarización. Para distribución pública habitual, el responsable debe aportar certificados de firma de Windows y credenciales Developer ID de Apple, configurar notarización y generar paquetes nuevos. Los certificados y contraseñas se guardan como secretos de CI, nunca en Git ni dentro de la aplicación.

`electron-builder.yml` desactiva la identidad de firma en macOS mientras no esté configurada. Esa opción debe revisarse al incorporar firma. Esta versión no incluye actualización automática: instala manualmente la nueva versión conservando la carpeta privada de datos.

## Datos y seguridad de la ventana

La aplicación usa `app.getPath('userData')/data`:

| Sistema | Ubicación habitual                                                |
| ------- | ----------------------------------------------------------------- |
| Windows | `%APPDATA%\Cantera\data`                                          |
| macOS   | `~/Library/Application Support/Cantera/data`                      |
| Linux   | `~/.config/Cantera/data` o su equivalente según `XDG_CONFIG_HOME` |

La carpeta contiene la base de cuentas y leads, configuración cifrada y su clave local. `server.log`, en el directorio padre, ayuda a diagnosticar fallos de arranque y se renueva en cada inicio. Consulta [copias de seguridad](operacion.md).

En entornos de prueba puedes definir `CANTERA_USER_DATA_DIR` para usar un perfil separado. `node scripts/smoke-desktop.mjs` comprueba la ventana, el registro y la persistencia en una carpeta temporal; necesita un entorno gráfico y el servidor preparado. Puedes pasar como argumento la ruta al ejecutable ya empaquetado para comprobar ese binario.

La ventana tiene aislamiento de contexto, sandbox y Node deshabilitado para la web. Los enlaces externos HTTP/HTTPS se abren en el navegador habitual; los enlaces de correo y teléfono validados se abren en la aplicación asociada del sistema. El proceso del servidor usa la API oficial [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process). Estas decisiones siguen la [guía de seguridad de Electron](https://www.electronjs.org/docs/latest/tutorial/security).
