# Configuración

## Empezar sin claves

`npm run setup` crea `.env.local` con `CANTERA_MODE=local` y `PROVIDER_MODE=fixture`. Si el archivo existe, lo conserva. Los instaladores de escritorio preparan el servidor automáticamente y guardan los datos en la carpeta de usuario del sistema.

Al abrir Cantera se crea la cuenta local con nombre, correo y una contraseña de 8 a 128 caracteres. El correo identifica la cuenta; el modo local no envía verificación ni recuperación por email. Usa la misma instalación para volver a entrar a sus datos.

## Buscar negocios reales

En Configuración, introduce las claves de tus proyectos de Google Places y OpenAI y selecciona el modo real. Las claves se guardan cifradas por usuario en la carpeta privada de Cantera. Una configuración personal guardada prevalece sobre los valores del entorno.

Para Places debes habilitar la API y facturación en tu proyecto de Google Cloud. Para OpenAI necesitas una clave con acceso a los modelos elegidos. Configura cuotas y límites en los paneles de los proveedores: el límite de la aplicación no sustituye esos controles. Las búsquedas reales consumen servicios externos; no existe una garantía de búsqueda ilimitada y gratuita.

Los modelos predeterminados están definidos en `lib/providers/ai.ts`. Los identificadores actuales tienen documentación oficial: [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) y [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra). El acceso concreto depende de tu proyecto y puede cambiar; compruébalo antes de activar llamadas reales.

## Variables del servidor

| Variable                                    | Uso                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `CANTERA_MODE`                              | `local` o `supabase`.                                                            |
| `CANTERA_DATA_DIR`                          | Carpeta de SQLite y configuración privada. En desarrollo, `.data/`.              |
| `PROVIDER_MODE`                             | `fixture`, `cassette` o `live`, si no hay configuración personal que prevalezca. |
| `PLACES_MODE`, `AI_MODE`                    | Selección independiente del proveedor cuando se usa configuración de entorno.    |
| `GOOGLE_PLACES_API_KEY`                     | Clave de Google Places para llamadas reales.                                     |
| `OPENAI_API_KEY`                            | Clave de OpenAI para llamadas reales.                                            |
| `OPENAI_BULK_MODEL`, `OPENAI_QUALITY_MODEL` | Modelos para calificación y redacción.                                           |
| `NEXT_PUBLIC_SUPABASE_URL`                  | URL del proyecto Supabase.                                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`             | Clave pública de Supabase.                                                       |
| `SUPABASE_SERVICE_ROLE_KEY`                 | Clave privada de servidor. Nunca debe llegar al cliente ni a Git.                |
| `CRON_SECRET`                               | Secreto para autorizar la purga programada en producción.                        |

El archivo [`.env.example`](../.env.example) contiene el resto de límites y parámetros. No escribas valores privados en el ejemplo ni en la configuración de Electron.

| Modo de proveedor | Comportamiento                                                                       |
| ----------------- | ------------------------------------------------------------------------------------ |
| `fixture`         | Usa negocios y respuestas ficticias, sin llamar a Google ni OpenAI.                  |
| `cassette`        | Reproduce respuestas guardadas; si no existen, realiza llamadas reales y las guarda. |
| `live`            | Consulta APIs reales con tus claves.                                                 |

Los cassettes se guardan en `.cassettes/` y se excluyen de Git. Pueden contener datos obtenidos de terceros; revisa los términos y plazos de conservación aplicables antes de usarlos. No son una base de datos comercial permanente.

## Supabase local o central

Para usar la base local de Supabase necesitas su CLI y Docker. Desde el proyecto:

```bash
supabase start
supabase db reset
npm run setup -- --supabase
npm run launch
```

`db reset` reinicia la base local: úsalo al preparar una instalación nueva, no sobre datos que necesitas conservar. `setup --supabase` lee las claves del CLI sin imprimirlas y solo escribe si no existe `.env.local`. Para convertir una instalación local ya configurada, edita su archivo: establece `CANTERA_MODE=supabase` y añade las tres variables de Supabase. Cambiar de modo no migra los datos de SQLite a Postgres.

Para un proyecto Supabase remoto, aplica las migraciones con su CLI, configura las URLs permitidas de autenticación y el correo, y añade las variables en el entorno privado del servidor. No empaquetes una `service role key` central dentro de un instalador: cualquier usuario podría extraerla.

La puesta en servicio compartido también requiere un dominio con HTTPS, respaldos, políticas de acceso revisadas y programación de `/api/cron/daily` con `CRON_SECRET`. Verifica cuotas, aislamiento entre cuentas y correo con tu propio proyecto antes de distribuir acceso.
