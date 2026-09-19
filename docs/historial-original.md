# La Cantera Global — Fase 0

Lo que no se puede cambiar barato después: esquema, RLS, cuotas y la frontera de proveedores.

---

## Los tres modos

Todo lo que cuesta dinero pasa por dos interfaces: `PlacesProvider` y `AiProvider`.
Una sola variable decide la implementación, y el pipeline no se entera.

| `PROVIDER_MODE` | Google Places | OpenAI | Cuándo |
|---|---|---|---|
| `fixture` | 0 llamadas | 0 llamadas | Desarrollo local diario y Modo Demo en clase |
| `cassette` | 1 vez, luego disco | 1 vez, luego disco | Validar contra datos reales sin repetir gasto |
| `live` | real | real | Producción |

En `fixture`, los 10 negocios ficticios apuntan a webs servidas por la propia app
en `/demo-site/[slug]`. El extractor corre contra HTML real, sin salir a internet.
Es el mismo dataset que exige la §48 para las clases: se construye una vez y sirve
para las dos cosas.

Los cassettes van en `.cassettes/` y **no se commitean**: contienen contenido de
Google, que los términos de Maps Platform no permiten almacenar de forma indefinida.

---

## Local, sin gastar nada

```bash
# Requisitos: Node 20+ y Docker Desktop ABIERTO
npm install
npx supabase start                # Postgres + Auth + Studio + correo local
npx supabase db reset             # aplica las migraciones
npm run dev
```

`config.toml` ya viene en el repo, así que no hace falta `supabase init`.
Las claves que imprime `npx supabase start` van en `.env.local` (copia `.env.example`).

`supabase start` imprime la anon key y la service role key: pegalas en `.env.local`.
Los enlaces de acceso no salen a internet: los captura el servidor de correo local
en `http://127.0.0.1:54324`.

El primer usuario que se registre queda como `admin` automáticamente. A partir de
ahí, el registro exige invitación previa en la tabla `invites`.

Con `PROVIDER_MODE=fixture` podés recorrer el MVP completo —búsqueda, scoring,
lead detail, ángulo, mensaje, CRM, seguimiento— sin una sola llamada facturada.

### Cuando quieras datos reales

```bash
PROVIDER_MODE=cassette npm run dev
```

La primera búsqueda cuesta 3 llamadas a Places (~$0.11, dentro del cupo gratis) y
una a Luna (~$0.014). Queda grabada. Todas las corridas siguientes son gratis y
deterministas, que además es lo que querés para depurar el scoring.

---

## Despliegue al dominio

**1. Supabase cloud.** Creá el proyecto y empujá la misma migración:

```bash
supabase link --project-ref <ref>
supabase db push
```

Mismo esquema en local y en producción, sin tocar el editor SQL a mano.

**2. Vercel.** Importá el repo. El plan Hobby no permite uso comercial, así que
con alumnos pagando va Pro. Habilitá Fluid Compute y `maxDuration: 300` en la
ruta del pipeline.

**3. Dominio.** Subdominio del dominio de Ascendia (`cantera.tudominio.com`),
CNAME a Vercel. Después agregá esa URL en Supabase → Authentication → URL
Configuration, o los magic links redirigen a localhost.

**4. Correo.** El SMTP que trae Supabase está limitado a unos pocos envíos por
hora y es solo para pruebas. Conectá Resend (plan gratis) antes de invitar al
primer alumno, o la mitad no va a poder entrar.

**5. Variables en Vercel** (Production): `PROVIDER_MODE=live`, las claves reales,
`DEMO_SITE_BASE=https://cantera.tudominio.com`. En Preview dejá `PROVIDER_MODE=fixture`
para que las ramas de prueba no gasten.

**6. Cron.** `/api/cron/daily` una vez al día: purga `places_cache` y `search_corpus`
vencidos. Vercel Cron está incluido.

---

## Tres techos de presupuesto, no uno

1. **Fuera del código.** Cuota diaria en la API key de Places en la consola de GCP
   y límite de gasto en el proyecto de OpenAI. Es el único techo que sobrevive a
   un bug tuyo.
2. **En Postgres.** `consume_quota(user_id, kind, n)` hace el upsert atómico y
   lanza excepción si excede; el incremento se revierte con la transacción.
   Se llama **antes** de cada operación pagada, nunca después.
3. **En la UI.** El mensaje amable de la §36.

Y el cuarto, que es el que de verdad protege: **acceso por invitación**. Si el
registro está abierto, cualquiera que encuentre el dominio gasta tu presupuesto.

---

## Costos

| Etapa | Mensual |
|---|---|
| Local (fixture) | $0 |
| Local (cassette, primera grabación) | centavos, dentro del cupo gratis |
| Producción, 30 alumnos | ~$291 (Places $173 · OpenAI $73 · Vercel $20 · Supabase $25) |

La línea grande es Places, no OpenAI. `search_corpus` es lo que la baja: si dos
alumnos buscan el mismo nicho en la misma ciudad dentro de 30 días, el segundo
no paga.

---

## Archivos

```
supabase/migrations/20260822000001_init.sql   esquema + RLS + cuotas + invitaciones
lib/providers/types.ts                        contratos y tabla de precios
lib/providers/places.ts                       Google · fixture · cassette
lib/providers/ai.ts                           OpenAI Responses · fixture · cassette
lib/quota.ts                                  consume_quota + registro de consumo
lib/fixtures/demo-dental-miami.json           10 negocios ficticios
```

`verifyEvidence()` en `ai.ts` es la regla anti-alucinación de la §20 convertida en
código: toda cita que no aparezca literalmente en el texto extraído se descarta, y
si un problema se queda sin evidencia, su puntaje cae a 0 antes de llegar a la UI.

---

## Siguiente

Fase 1: layout, auth y las 5 secciones. Con `PROVIDER_MODE=fixture` se puede
construir entera sin gastar un centavo.

---

## Fase 1 — qué quedó construido

- Auth por enlace de correo (`/login`), verificación en `/auth/confirm`, cierre en `/auth/signout`.
- `middleware.ts` refresca la sesión y protege todo salvo `/login`, `/auth` y `/demo-site`.
- Shell con las 5 secciones. La sexta, **Consumo**, solo aparece si tu perfil es admin.
- **Inicio**: saludo, CTA, las 6 métricas de la §12 y el bloque PARA HOY. Todo sale de
  consultas reales sobre `leads`; con la base vacía muestra ceros, no datos inventados.
- **Mis leads** y **Seguimientos**: consultas reales con los estados vacíos de la §44.
- **Configuración**: cuánta cuota te queda hoy, calculada contra `usage_counters`.
- **Buscar clientes** y el editor de oferta declaran que son de la fase 2 en vez de
  fingir con botones muertos (§53).
- `/demo-site/[slug]`: 10 webs ficticias que sirven de blanco para el extractor de la
  fase 4. Deliberadamente desiguales — unas con reserva online, otras solo teléfono —
  porque si todas fueran iguales el scoring no se podría probar.

### Decisiones de diseño

La paleta la fija el brief. Los ejes libres eran tipografía y estructura:

- **Un solo superfamiliar variable (Archivo)**, con el eje de *ancho* cargando la
  jerarquía: los títulos se ensanchan al 118%, los datos quedan neutros y con cifras
  tabulares para que las columnas de score no bailen.
- **La veta** (`components/score-seam.tsx`) es el elemento firma. Cuatro estratos con
  ancho proporcional a su peso máximo (30/35/20/15), rellenos hasta lo que puntuaron.
  Un 70 con casi todo en encaje y nada en problema se ve distinto a un 70 repartido,
  y esa diferencia es justo la que decide a quién escribir primero. Es la §21 hecha
  visible, no decoración.
- El dorado aparece **una vez por bloque**: el CTA, o el score alto, o el marcador de
  sección activa. Nunca los tres juntos.

### Arrancar

```bash
npm install
supabase start && supabase db reset
npm run dev
```

Regístrate con tu correo en `/login` y abre el enlace desde el correo local
(`http://127.0.0.1:54324`). El primer usuario queda admin.

---

## Fase 2 — oferta y asistente de búsqueda

- **Asistente de 4 pasos** (`/buscar`): qué vendes → a quién → dónde → confirmar.
  La barra de progreso reusa el lenguaje visual de la veta: partes de un todo.
- **"✨ Ayúdame a definirlo"** pasa por `AiProvider.inferProblem()`, igual que todo
  lo que cuesta dinero. En modo fixture responde sin llamar a nadie. Además de
  deducir el problema sugiere 2-4 nichos, que aparecen en el paso 2.
- **Editor de oferta** en Configuración. La última oferta guardada precarga el
  asistente: nadie quiere reescribir lo que vende en cada búsqueda.
- **Cuota real.** `searches_per_day` se consume al crear la búsqueda, no al
  ejecutarla, porque el pipeline de la fase 3 es reanudable y cobrar en el run
  duplicaría el cargo cada vez que se corte la conexión.
- **Modo demo desde el asistente**: casilla "Probar con datos de ejemplo". No gasta
  búsquedas del día y marca la búsqueda con el badge DEMO de la §48.
- `/buscar/[id]` muestra el resumen y declara que el motor llega en la fase 3.

### Dos cosas que cambiaron respecto a la fase 1

- `middleware.ts` pasó a **`proxy.ts`** con la función exportada como `proxy`.
  Next 16 marca el convenio anterior como obsoleto y avisa en cada build.
- El proyecto compila: `npx tsc --noEmit` limpio y `next build` genera las 12 rutas.

### Estado por fase

| Fase | Estado |
|---|---|
| 0 · esquema, RLS, cuotas, proveedores | hecho |
| 1 · UI, navegación, auth | hecho |
| 2 · oferta y asistente | hecho |
| 3 · proveedor de negocios y resultados | siguiente |

---

## Fase 3 — el motor de descubrimiento

**Una sola request con streaming.** `GET /api/searches/[id]/run` devuelve SSE con
`maxDuration = 300`. El pipeline es un generador (`lib/pipeline/discover.ts`) que emite
progreso mientras trabaja y el route handler lo convierte en eventos. Sin cola, sin
worker, sin Redis. Si el alumno cierra la pestaña, el estado quedó en `searches.status`
y al volver no se vuelve a cobrar nada.

Los mensajes de carga que ve el alumno son los reales del pipeline, no un temporizador
falso: si una etapa tarda, se nota. Nunca "Processing batch 4/8" (§43).

**Caché de corpus.** Antes de llamar a Google se busca `search_corpus` por clave
normalizada `nicho|ciudad|país|idioma`. Si está vigente y el 80% de sus `place_id`
siguen en `places_cache`, la búsqueda cuesta cero. Es la palanca que baja la línea
más cara de la factura.

**Deduplicación en cuatro niveles** (§16): place_id, dominio, teléfono, nombre+ciudad.
Los teléfonos se normalizan a los últimos 10 dígitos — la primera versión dejaba pasar
`+1 305 555 0101` y `(305) 555-0101` como negocios distintos, que en Miami es
exactamente el caso frecuente.

**Resultados y CRM son la misma fila.** `leads.saved` distingue "apareció en una
búsqueda" de "está en Mis Leads". Guardar es un booleano, no una copia de veinte
columnas a otra tabla.

### Estado por fase

| Fase | Estado |
|---|---|
| 0 · esquema, RLS, cuotas, proveedores | hecho |
| 1 · UI, navegación, auth | hecho |
| 2 · oferta y asistente | hecho |
| 3 · descubrimiento, deduplicación, resultados | hecho |
| 4 · prefiltro sin IA y lectura de webs | siguiente |

---

## Fase 4 — prefiltro y lectura de webs

Todo con reglas. Cero tokens gastados en esta fase.

**Prefiltro** (`lib/pipeline/prefilter.ts`). Descarta por: negocio cerrado, sin web ni
teléfono, categoría que no corresponde al nicho, fuera de la ciudad, sin presencia
digital comprobable. Las reglas son deliberadamente conservadoras — ante la duda, pasa:
descartar un buen lead cuesta más que analizar uno mediocre. Cuando el alumno escribe
un nicho a mano no hay mapeo de categorías contra el cual comparar, así que esa regla
se salta en vez de inventarse un criterio.

El prefiltro **no borra, marca**. `leads.candidate` y `leads.discard_reason` dejan ver
en la pantalla cuántos se cayeron y por qué, lo que permite afinar las reglas mirando
datos reales en vez de suposiciones.

**Extracción** (`lib/pipeline/extract.ts`). `fetch` normal, sin navegador headless.
Timeout de 5s, concurrencia de 8, corte a 500 KB, solo `text/html`. Como máximo dos
páginas: la home y, únicamente si falta el email, la de contacto. El parseo es en
streaming con `htmlparser2` — nunca se construye un DOM completo. El texto sale
recortado a `MAX_WEBSITE_CHARS` porque cada carácter que llegue al modelo se paga.

Detecta sin IA: email público, teléfono, formulario, reserva online, WhatsApp, CTA
principal y enlaces sociales.

`businessStatus` se añadió al field mask de Places. Es un campo del SKU Pro y las
llamadas ya se facturan a Enterprise por pedir website y rating, así que traerlo
cuesta cero y evita analizar negocios cerrados.

### Tres bugs que aparecieron al probar

1. **`facebook.com` contiene `book`.** La primera versión buscaba la subcadena y
   marcaba como "tiene reserva online" a cualquier negocio con Facebook. Eso mata
   justo la oportunidad que el producto existe para encontrar. Ahora: dominios de
   agendamiento conocidos, o la palabra en el path con barra delante, o una frase
   de acción completa en el texto del enlace.
2. **Las claves del mapa de categorías llevaban tilde** y la función que normaliza
   las quita, así que el lookup fallaba en silencio y el prefiltro dejaba pasar
   cualquier categoría. Un gimnasio pasaba una búsqueda de dentistas.
3. **El filtro antibasura de emails descartaba `example`**, que es el TLD de los
   propios fixtures: en modo demo nunca se habría detectado un email.

Los tres se encontraron corriendo las funciones puras aisladas con Node, sin levantar
la app. Las pruebas están en el historial, no en el repo — vale la pena convertirlas
en un runner de verdad cuando el pipeline se estabilice.

### Estado por fase

| Fase | Estado |
|---|---|
| 0 · esquema, RLS, cuotas, proveedores | hecho |
| 1 · UI, navegación, auth | hecho |
| 2 · oferta y asistente | hecho |
| 3 · descubrimiento, deduplicación, resultados | hecho |
| 4 · prefiltro y lectura de webs | hecho |
| 5 · calificación con IA y scoring | siguiente |

---

## Fase 5 — calificación y scoring

**El modelo produce 35 puntos de 100.** Los otros 65 los calcula TypeScript
(`lib/pipeline/score.ts`): ICP fit, commercial fit y contactability salen de datos que
ya tenemos. Pedirle el número final al modelo costaba tres cosas: el mismo negocio
salía 84 en una corrida y 71 en la siguiente, el alumno no podía saber de dónde venía
el número, y se pagaban tokens de salida por aritmética.

**Preorden antes de gastar.** Cuando hay más candidatos que presupuesto, se ordenan por
la parte determinista del score y entran al modelo los mejores. El tope es el menor
entre `MAX_AI_ANALYSES_PER_SEARCH`, lo que queda de cuota diaria y el número de
candidatos — se recorta el trabajo, nunca se falla a mitad (§36).

**Lotes de 5**, no de 10: un fallo de esquema invalida cinco leads, no diez. Un lote
caído se registra y la búsqueda sigue.

**El texto de las webs no se persiste.** 3.500 caracteres por lead son ~175 KB por
búsqueda; con 30 alumnos serían cientos de MB al mes contra los 500 MB del plan
gratuito de Supabase. Viaja en memoria de la etapa de extracción a la de calificación.
Si el proceso se reanuda y el mapa viene vacío, se releen las webs — releer es gratis,
guardar no.

### El dorado dejó de significar "más de 75"

El test de scoring destapó una compresión: 65 de los 100 puntos miden "existe, está
activo y se le puede escribir", y eso casi todo negocio real lo maximiza. Un lead con
**cero señal del problema saca 71**. Pintarlo de dorado por pasar un umbral numérico
habría destacado negocios a los que el alumno no tiene nada que decirles.

Ahora el dorado se enciende con `qualified`, que exige señal de problema real
(≥12 de 35) además de los 55 puntos totales. La veta sigue mostrando el desglose, así
que un 71 sin problema se ve vacío en el segmento que importa.

Los pesos 30/35/20/15 vienen fijados por la §21 y no los toqué. Si en producción los
scores se apiñan entre 60 y 90, la palanca es subir el peso del problema, no cambiar
el umbral.

### La regla anti-alucinación, verificada

`verifyEvidence` se probó con una respuesta que afirmaba "pierden 15.000 dólares al
mes" citando texto inexistente. Resultado: evidencia descartada, puntos de problema a
cero, problema observado a null. No llega a pantalla. La §20 dejó de ser una
instrucción de prompt y pasó a ser una garantía del código.

### Estado por fase

| Fase | Estado |
|---|---|
| 0-4 | hecho |
| 5 · calificación y scoring | hecho |
| 6 · lead detail y ángulo | siguiente |
| 7 · primer mensaje · 8 · CRM · 9 · dashboard · 10 · costes | pendiente |

---

## Fase 6 — ficha del lead y ángulo

**La evidencia se muestra con su origen.** Cada cita aparece literal, con la afirmación
que sustenta y un enlace a la página de donde salió. El alumno puede verificar antes de
escribirle a nadie, que es la diferencia entre una herramienta de prospección y un
generador de excusas.

La ficha separa explícitamente los dos registros que la §20 obliga a distinguir:

- **Lo que encontramos** — hechos. Cada línea es comprobable: categoría, valoración,
  reseñas, teléfono, email, formulario. Y las ausencias, que suelen ser la señal:
  "No encontramos reserva online visible".
- **Posible oportunidad** — interpretación, y lo dice: *"es una interpretación nuestra
  a partir de los hechos de abajo, no algo que el negocio haya dicho"*.

**Tres estados en los que el botón de ángulo no aparece**, y en los tres se explica por
qué en vez de dejar un botón muerto:

1. El negocio se descartó en el prefiltro → se nombra la razón.
2. No llegó a analizarse porque se acabó la cuota → se dice que vuelva mañana.
3. Se analizó pero **no hay evidencia citable** → *"no hay base para un ángulo honesto,
   este es de los que conviene dejar pasar"*.

El tercero es el importante. Sin evidencia verificada, `createAngle` ni siquiera
consume cuota: se niega antes. El producto prefiere decir "no tengo nada" a producir
un ángulo genérico, porque un ángulo genérico enviado a un negocio real quema al
alumno y de paso a Ascendia.

**El ángulo no vuelve a leer la web.** Trabaja solo con la evidencia ya verificada que
quedó guardada, así que es una llamada corta al modelo de calidad y no puede introducir
contexto nuevo que nadie comprobó.

### Estado por fase

| Fase | Estado |
|---|---|
| 0-5 | hecho |
| 6 · ficha del lead y ángulo | hecho |
| 7 · primer mensaje | siguiente |
| 8 · CRM y seguimientos · 9 · dashboard · 10 · costes | pendiente |

---

## Fase 7 — el primer mensaje

**Las reglas de la §29 son un linter, no un prompt.** `lib/pipeline/message-rules.ts`
verifica: sin enlaces ni dominios sueltos, sin precios ni tarifas, máximo 4 líneas y
600 caracteres, sin jerga corporativa ni de agencia, y cierre con micro-pregunta.

Un prompt que dice "sin enlaces" se cumple casi siempre. "Casi" no sirve: esto lo pega
un alumno en un DM a un negocio real, y un mensaje con un link va directo a spam.

El flujo cuando el modelo se sale de las reglas:

1. Se reintenta **una vez**, diciéndole exactamente qué rompió.
2. Si vuelve a fallar, se repara mecánicamente y el alumno ve el aviso.
3. Si ni así pasa, **no se guarda nada** y se le dice que reintente. Antes entregar
   nada que entregar un mensaje que le queme un prospecto.

El reparador conserva la línea de cierre: recorta por el medio, nunca por el final, o
el mensaje se queda sin la pregunta que es su único objetivo. Y descarta solo las
líneas que quedaron huecas al quitar el enlace — una línea corta legítima como
"¿Te lo muestro?" se respeta.

**Un canal por vez** (§28). Generar los tres cuando el alumno quiere uno es triplicar
tokens para nada. El selector marca con un punto dorado los que ya tienen mensaje.

El idioma sale de la búsqueda que originó el lead, no de la interfaz: se puede
prospectar en Miami en inglés desde una cuenta en español.

### Estado por fase

| Fase | Estado |
|---|---|
| 0-6 | hecho |
| 7 · primer mensaje | hecho |
| 8 · CRM, estados y seguimientos | siguiente |
| 9 · dashboard · 10 · costes y modo demo | pendiente |

---

## Fase 8 — CRM, estados y seguimientos

**La regla de no insistir está en el código, no en un consejo.** La cadencia es 3 días
para el primer seguimiento, 6 para el segundo, y después **nada**: `DIAS_SIGUIENTE`
devuelve `null` y el sistema deja de proponer. La ficha lo dice sin rodeos:

> Ya hiciste dos seguimientos. Dos sin respuesta son una respuesta: déjalo descansar
> y pon tu tiempo en los que sí contestan.

Es la única regla del producto que va contra el interés aparente del alumno —insistir
se siente productivo— y por eso tiene que ser estructural. Un alumno que aprende a
perseguir aquí lo va a hacer en todas partes, y con el nombre de Ascendia encima.

**Marcar Contactado programa el primer seguimiento solo** y guarda el lead si no lo
estaba. Cerrado y Descartado limpian el seguimiento: no se persigue lo que ya terminó.

**Mis Leads agrupa por momento comercial**, no por estado suelto: Activos, Listos para
contactar, Esperando respuesta, En conversación, Cerrados. Cada grupo lleva su
contador, y el seguimiento atrasado se marca en dorado.

**Seguimientos** muestra Atrasados, Hoy y Próximos, con "Ya le escribí" en cada fila
para avanzar la cadencia sin abrir la ficha, y el contador "seguimiento 2 de 2" para
que se vea dónde termina.

Cada cambio de estado, nota y seguimiento queda en `activities` y se muestra como
historial en la ficha.

### Un error que atrapó el build

`status-actions.ts` exportaba el objeto `ESTADOS` y un helper síncrono. Un archivo
`"use server"` solo admite exportaciones de funciones asíncronas — el typecheck pasó
y el build falló. El vocabulario y las reglas se mudaron a `lib/crm.ts`, que además
es donde tenían que estar: las usan componentes cliente y servidor por igual.

### Estado por fase

| Fase | Estado |
|---|---|
| 0-7 | hecho |
| 8 · CRM, estados y seguimientos | hecho |
| 9 · dashboard y métricas | siguiente |
| 10 · controles de coste y modo demo | pendiente |

---

## Fase 9 — dashboard

**El embudo, no un muro de métricas.** Cinco etapas —Guardados, Contactados,
Respondieron, Demos, Cierres— con la conversión entre cada par. Las etapas son
acumulativas: quien cerró también respondió, así que el embudo siempre decrece y las
conversiones significan algo. Los descartados quedan fuera: no son parte del embudo,
son los que el alumno decidió no trabajar.

La barra reusa el lenguaje visual de la veta, y solo la última etapa —los cierres— va
en dorado. Es la única cifra que paga la academia.

**PARA HOY es navegable** (§33). Cada tarjeta lleva a la pantalla donde se hace esa
acción: Encontrar abre la última búsqueda, Contactar filtra los listos, Seguir va a
seguimientos, Cerrar filtra las conversaciones abiertas. Las tarjetas sin nada
pendiente se apagan en vez de desaparecer, para que la rutina se vea completa.

**Primera vez sin datos**: en vez de un embudo de ceros, una frase que explica qué
hace la herramienta. Un dashboard vacío no enseña nada.

### Un contador que mentía

"Te quedan N leads por revisar" contaba los candidatos con `saved = false`. Pero
descartar un resultado también deja `saved = false`, así que los rechazados volvían a
aparecer como pendientes y el número nunca bajaba a cero por mucho que el alumno
trabajara. Ahora se excluyen los que están en estado descartado.

### Estado por fase

| Fase | Estado |
|---|---|
| 0-8 | hecho |
| 9 · dashboard y métricas | hecho |
| 10 · controles de coste, panel de consumo y purga | siguiente y última |

---

## Fase 10 — controles de coste

**Cuatro techos, en orden de a quién sobreviven.**

1. **Acceso por invitación.** Sin invitación no hay registro. Es el control más
   efectivo que existe: nadie que encuentre el dominio puede gastar tu presupuesto.
   El panel deja invitar y revocar desde la interfaz.
2. **Fuera del código.** Cuota diaria en la API key de Places en la consola de Google y
   límite de gasto del proyecto de OpenAI. Es lo único que sobrevive a un bug tuyo, y
   el panel lo dice en pantalla para que no se olvide.
3. **En Postgres.** `consume_quota` atómico, antes de cada operación pagada.
4. **En la interfaz.** El mensaje amable, y el recorte del trabajo al presupuesto
   disponible en vez de fallar a mitad.

**Panel de consumo** (§35): gasto de hoy y de 30 días, alumnos activos, búsquedas,
negocios encontrados, tokens, desglose por tipo de operación y por alumno —ordenado
por gasto, con los que pasan de $15 en dorado— y editor de límites.

**Purga diaria** en `/api/cron/daily`, programada en `vercel.json` a las 7:00 UTC.
Borra el contenido de Google vencido. No es una optimización: los términos de Maps
Platform no permiten almacenarlo indefinidamente, así que la tarea es parte del
cumplimiento. También limpia contadores diarios de más de 60 días.

---

## MVP completo

El recorrido de la §51, verificado paso por paso contra el código: **20/20**.

Entrar · describir la oferta · elegir nicho, país, ciudad e idioma · encontrar
negocios · deduplicar · prefiltrar sin IA · leer home y contacto · buscar datos
públicos · calificar con el modelo barato · ordenar por score · abrir un lead · ver
oportunidad y evidencia · crear ángulo · crear mensaje · copiar · marcar contactado ·
programar seguimiento · dashboard actualizado.

### Lo que falta antes de dárselo a alumnos

1. **Una corrida en `cassette` contra webs reales.** Los fixtures son honestos pero
   ordenados. Las webs de verdad tienen Cloudflare, redirecciones raras, HTML de
   constructores visuales y páginas que tardan 8 segundos. Ahí se ve si el extractor
   aguanta y si el scoring separa igual de bien.
2. **Convertir las pruebas en un runner.** Las de deduplicación, extracción, prefiltro,
   scoring, evidencia y linter se corrieron a mano con `node --experimental-strip-types`.
   El bug de `facebook`/`book` vuelve el día que alguien toque la lista de palabras sin
   una prueba que lo frene.
3. **Desplegar** siguiendo la sección de arriba: Supabase cloud, Vercel Pro, dominio,
   Resend para los enlaces de acceso, y `CRON_SECRET`.
4. **Revisar la compresión del score** con datos reales. Si todo se apiña entre 60 y 90,
   la palanca es el peso del problema, no el umbral.

### Estado por fase

| Fase | Estado |
|---|---|
| 0 · esquema, RLS, cuotas, proveedores | hecho |
| 1 · UI, navegación, auth | hecho |
| 2 · oferta y asistente | hecho |
| 3 · descubrimiento y deduplicación | hecho |
| 4 · prefiltro y lectura de webs | hecho |
| 5 · calificación y scoring | hecho |
| 6 · ficha del lead y ángulo | hecho |
| 7 · primer mensaje | hecho |
| 8 · CRM, estados y seguimientos | hecho |
| 9 · dashboard | hecho |
| 10 · controles de coste | hecho |
