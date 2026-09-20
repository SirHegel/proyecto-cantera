# Cantera

Cantera ayuda a convertir negocios encontrados en oportunidades comerciales: definir una oferta, buscar empresas, revisar sus webs públicas, priorizar con evidencia, preparar mensajes y organizar el seguimiento en un CRM.

Incluye una aplicación de escritorio para Windows, macOS y Linux, y una versión web que puede ejecutarse en el propio equipo. Cada persona puede crear su cuenta local. La cuenta y el CRM se guardan en ese equipo, sin sincronización automática entre computadoras. Al activar búsquedas reales, Google Places y OpenAI procesan las consultas y el contenido necesario para sus funciones.

## Instalar la aplicación

Descarga el archivo de tu sistema desde [la última versión publicada de Cantera](https://github.com/SirHegel/proyecto-cantera/releases/latest). El repositorio y las descargas son públicos. En esa página encontrarás los instaladores, las notas de la versión y `SHA256SUMS.txt` para comprobar sus archivos.

| Sistema             | Archivo                           | Instalación                                       |
| ------------------- | --------------------------------- | ------------------------------------------------- |
| Windows x64         | `Cantera-…-win-x64.exe`           | Ejecuta el instalador y abre Cantera.             |
| macOS Intel         | `Cantera-…-mac-x64.dmg`           | Abre la imagen y arrastra Cantera a Aplicaciones. |
| macOS Apple Silicon | `Cantera-…-mac-arm64.dmg`         | Abre la imagen y arrastra Cantera a Aplicaciones. |
| Linux x64           | `Cantera-…-linux-x86_64.AppImage` | Dale permiso de ejecución y ábrelo.               |
| Debian/Ubuntu x64   | `Cantera-…-linux-amd64.deb`       | Instálalo con el gestor de paquetes.              |

El instalador incluye el entorno necesario: el usuario final no necesita Node.js ni Docker. Los paquetes actuales no incorporan firma comercial de Windows ni notarización de Apple; el sistema puede advertir sobre el editor. Consulta los resultados de cada versión en el [informe de validación](docs/validacion.md) y las instrucciones de [distribución y firma](docs/escritorio.md).

En Debian/Ubuntu se recomienda el `.deb`, que configura la integración y el sandbox al instalarse. El AppImage necesita FUSE2 y un sistema compatible con el sandbox de Chromium.

## Primer recorrido

1. Abre Cantera y crea una cuenta con nombre, correo y contraseña.
2. En **Configuración**, describe qué vendes y qué problema resuelves.
3. Empieza con **datos de ejemplo** para recorrer el producto sin consumir APIs.
4. Para buscar negocios reales, configura tus claves de Google Places y OpenAI, selecciona el modo real y guarda.
5. En **Buscar clientes**, elige nicho, ubicación e idioma; ejecuta la búsqueda.
6. Revisa la evidencia de cada resultado, guarda los leads útiles y genera un ángulo y un borrador de mensaje.
7. Revisa **Mis leads → Por contactar**: incluye los estados **Sin contactar** y **Listo para contactar**.
8. Copia el texto y contacta por tu canal habitual. Después marca **Contactado**; así queda registrado y se programa el primer seguimiento.

Si marcas un contacto por error, vuelve a **Sin contactar**: se limpia su próxima fecha y se reinicia el contador de seguimientos, conservando sus notas e historial. En **Buscar clientes → Historial de búsquedas** puedes volver a las búsquedas anteriores; se muestran ocho por página con controles Anterior y Siguiente y el total guardado.

Cantera prepara borradores; no envía correos ni mensajes automáticamente. Los resultados de ejemplo son ficticios y no cambian por elegir otra ciudad: sirven para probar el recorrido. La búsqueda real necesita conexión, claves válidas y facturación de los proveedores. Consulta [configuración](docs/configuracion.md).

La guía [Tus datos y el seguimiento de clientes](docs/datos-y-seguimiento.md) explica dónde se guardan búsquedas, contactos, mensajes, estados y notas, cómo conservarlos al actualizar y qué información procesan los servicios externos.

## Ejecutar desde el código

Instala [Node.js 24 LTS](https://nodejs.org/) con npm. También se admite Node 22.19 o posterior de la rama 22. La primera preparación necesita conexión para descargar las dependencias.

Dentro de la carpeta `cantera`:

```bash
npm run launch
```

El lanzador crea `.env.local` si no existe, instala las dependencias necesarias, compila la aplicación e inicia `http://127.0.0.1:3000`. Abre el navegador cuando el servidor responde. Conserva abierta la terminal; **Ctrl+C** detiene Cantera.

También puedes usar `iniciar-windows.cmd`, `iniciar-macos.command` o `bash iniciar-linux.sh`. Si macOS pierde los permisos al descomprimir, ejecuta `chmod +x iniciar-macos.command` una vez.

```bash
# Desarrollo con recarga automática
npm run launch -- --dev

# Otro puerto o equipo sin navegador
npm run launch -- --port 3001 --no-open

# Crear y abrir la aplicación de escritorio desde el código
npm ci
npm run desktop

# Generar instalador para el sistema donde estás compilando
npm run desktop:dist
```

## Qué incluye

- Panel de actividad, búsquedas guiadas y resultados ordenados por puntuación.
- Extracción de señales públicas y separación de hechos e interpretaciones.
- Ficha de oportunidad, notas, estados, mensajes y seguimiento comercial, con separación entre pendientes de contacto y contactados.
- Historial de búsquedas con total y navegación de ocho registros por página.
- Registro e inicio de sesión local; persistencia SQLite y claves de proveedor cifradas.
- Interfaz adaptable a escritorio y móvil.
- Modo Supabase opcional para autenticación y datos compartidos.
- Pruebas unitarias, recorrido de navegador y automatización para los tres sistemas.

## Organización

```text
cantera/
├── app/                 Pantallas, acciones y API de Next.js
├── components/          Componentes de interfaz
├── lib/                 Datos, autenticación, proveedores y pipeline
├── electron/            Ventana de escritorio y servidor integrado
├── scripts/             Preparación, lanzamiento y empaquetado
├── tests/               Pruebas automatizadas
├── supabase/            Configuración y migraciones de la base remota
├── docs/                Guías, arquitectura e historial
├── .github/workflows/   Verificación e instaladores por plataforma
├── .data/               Datos privados al ejecutar desde el código
└── dist/                Instaladores generados; excluidos de Git
```

Los datos locales, las claves, las dependencias y los instaladores no se suben al repositorio. El [historial original](docs/historial-original.md) se conserva como contexto, no como instrucciones vigentes.

## Verificar y mantener

```bash
npm ci
npm run setup
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

La integración continua ejecuta instalación, tipos, pruebas y compilación en Windows, macOS y Linux; el recorrido de navegador se ejecuta con Chromium en Linux. Consulta los resultados y límites de cada versión en el [informe de validación](docs/validacion.md). La documentación del código en desarrollo puede adelantarse a la última Release publicada.

- [Arquitectura y objetivo del producto](docs/arquitectura.md)
- [Tus datos, historial y seguimiento de clientes](docs/datos-y-seguimiento.md)
- [Configuración, datos de ejemplo y proveedores reales](docs/configuracion.md)
- [Instaladores, compilación y firma](docs/escritorio.md)
- [Copias de seguridad, Docker y solución de problemas](docs/operacion.md)
