import { paisLabel } from "@/lib/catalog";
import type { ProviderSettings } from "@/lib/settings";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cassetteDirectory } from "./cassette-path";
import type {
  PlacesProvider,
  PlacesQuery,
  PlaceResult,
  ProviderMode,
  ProviderRuntime,
} from "./types";

function keyOf(q: PlacesQuery): string {
  const raw = `${q.niche}|${q.city}|${q.country}|${q.language}|${q.limit}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

// --- Google -----------------------------------------------------------------

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.websiteUri", // <- estos cuatro empujan la llamada
  "places.nationalPhoneNumber", //    al SKU Enterprise ($35/1000).
  "places.rating", //    Quitarlos la baja a Pro ($32/1000)
  "places.userRatingCount", //    pero rompe scoring y contactabilidad.
  "nextPageToken",
].join(",");

class GooglePlaces implements PlacesProvider {
  readonly mode: ProviderMode = "live";
  constructor(
    private readonly settings?: ProviderSettings,
    private readonly runtime: ProviderRuntime = {},
  ) {}

  async search(q: PlacesQuery) {
    if (!Number.isSafeInteger(q.limit) || q.limit < 1 || q.limit > 100)
      throw new Error("La búsqueda debe pedir entre 1 y 100 negocios.");
    const key = this.settings?.googleKey || process.env.GOOGLE_PLACES_API_KEY;
    if (!key) throw new Error("GOOGLE_PLACES_API_KEY no configurada");

    const places: PlaceResult[] = [];
    let pageToken: string | undefined;
    let calls = 0;
    const seenIds = new Set<string>();
    const seenTokens = new Set<string>();
    const body = {
      textQuery: q.city
        ? `${q.niche} in ${q.city}, ${paisLabel(q.country)}`
        : `${q.niche} in ${paisLabel(q.country)}`,
      languageCode: q.language,
      pageSize: Math.min(20, q.limit),
    };

    while (places.length < q.limit && calls < 5) {
      let res: Response;
      try {
        res = await (this.runtime.fetch ?? fetch)(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            signal: AbortSignal.timeout(this.runtime.timeoutMs ?? 20_000),
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": key,
              "X-Goog-FieldMask": FIELD_MASK,
            },
            body: JSON.stringify({
              ...body,
              ...(pageToken ? { pageToken } : {}),
            }),
          },
        );
      } catch (error) {
        if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
          throw new Error("Google Places tardó demasiado en responder. Inténtalo de nuevo.");
        throw new Error("No pudimos conectar con Google Places. Revisa tu conexión.");
      }
      calls++;

      if (!res.ok)
        throw new Error(
          `Google Places no respondió correctamente (HTTP ${res.status}). Revisa la clave, facturación y cuotas.`,
        );
      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        throw new Error("Google Places devolvió una respuesta JSON inválida.");
      }
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        (data.places !== undefined && !Array.isArray(data.places)) ||
        (data.nextPageToken !== undefined && typeof data.nextPageToken !== "string")
      ) {
        throw new Error("Google Places devolvió una respuesta con formato inválido.");
      }

      for (const p of (data.places ?? []) as Record<string, any>[]) {
        if (
          !p ||
          typeof p !== "object" ||
          typeof p.id !== "string" ||
          !/^[A-Za-z0-9_-]{1,512}$/.test(p.id) ||
          typeof p.displayName?.text !== "string" ||
          !p.displayName.text.trim()
        ) {
          throw new Error("Google Places devolvió un negocio sin identificador o nombre válidos.");
        }
        if (seenIds.has(p.id)) continue;
        seenIds.add(p.id);
        places.push({
          placeId: p.id,
          displayName: p.displayName?.text ?? "",
          formattedAddress: p.formattedAddress,
          city: q.city ?? undefined,
          primaryType: p.primaryType,
          types: Array.isArray(p.types)
            ? p.types.filter((type: unknown) => typeof type === "string")
            : [],
          businessStatus: p.businessStatus,
          websiteUri: p.websiteUri,
          phone: p.nationalPhoneNumber,
          rating: p.rating,
          userRatingCount: p.userRatingCount,
          googleMapsUri: p.googleMapsUri,
          lat: p.location?.latitude,
          lng: p.location?.longitude,
        });
      }

      pageToken = data.nextPageToken as string | undefined;
      if (!pageToken) break;
      if (seenTokens.has(pageToken)) break;
      seenTokens.add(pageToken);
    }

    return { places: places.slice(0, q.limit), calls };
  }
}

// --- Fixture (0 llamadas, datos ficticios, es lo que ve la clase) ------------

class FixturePlaces implements PlacesProvider {
  readonly mode: ProviderMode = "fixture";
  constructor(private readonly demoBase?: string) {}

  async search(q: PlacesQuery) {
    const mod = await import("../fixtures/demo-dental-miami.json");
    const raw = (mod.default ?? mod) as unknown as (PlaceResult & { slug: string })[];
    // El origen real de la petición, no un puerto asumido: si Next arranca en
    // 3001 porque el 3000 está ocupado, las webs demo tienen que seguirlo o el
    // extractor sale a buscar a un puerto vacío y se queda sin texto que citar.
    const base = this.demoBase ?? process.env.DEMO_SITE_BASE ?? "http://localhost:3000";

    // Las webs demo las sirve la propia app en /demo-site/[slug]. Así el
    // extractor corre contra HTML real sin salir a internet ni gastar nada.
    const places = raw.map(({ slug, ...p }) => ({
      ...p,
      websiteUri: `${base}/demo-site/${slug}`,
    }));

    await new Promise((r) => setTimeout(r, 400)); // latencia simulada
    return { places: places.slice(0, q.limit), calls: 0 };
  }
}

// --- Cassette (una llamada real, se reproduce infinitas veces) ---------------
// Los cassettes NO se commitean: contienen contenido de Google.

class CassettePlaces implements PlacesProvider {
  readonly mode: ProviderMode = "cassette";
  constructor(
    private readonly live = new GooglePlaces(),
    private readonly directory = cassetteDirectory("places"),
  ) {}

  async search(q: PlacesQuery) {
    const file = path.join(this.directory, `${keyOf(q)}.json`);
    let contents: string | undefined;
    try {
      contents = await fs.readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("No pudimos leer la grabación de Google Places.");
    }
    if (contents !== undefined) {
      let cached: { places: PlaceResult[]; recordedAt: string };
      try {
        cached = JSON.parse(contents);
      } catch {
        throw new Error("La grabación de Google Places contiene JSON inválido.");
      }
      if (!cached || !Array.isArray(cached.places))
        throw new Error("La grabación de Google Places tiene un formato inválido.");
      const age = Date.now() - Date.parse(cached.recordedAt);
      if (!Number.isFinite(age) || age > 30 * 864e5)
        throw new Error(
          "La grabación de Google Places caducó. Elimínala para volver a consultar el proveedor.",
        );
      return { places: cached.places as PlaceResult[], calls: 0 };
    } else {
      const fresh = await this.live.search(q);
      await fs.mkdir(this.directory, { recursive: true });
      await fs.writeFile(
        file,
        JSON.stringify({ query: q, recordedAt: new Date().toISOString(), ...fresh }, null, 2),
      );
      return fresh;
    }
  }
}

/**
 * PLACES_MODE manda sobre PROVIDER_MODE. Sirve para conectar Google de verdad
 * mientras la IA sigue en fixture, que es como se prueba el descubrimiento sin
 * gastar tokens ni necesitar todavía la clave de OpenAI.
 */
export function getPlacesProvider(
  mode?: ProviderMode,
  demoBase?: string,
  settings?: ProviderSettings,
  runtime: ProviderRuntime = {},
): PlacesProvider {
  const m = (mode ??
    settings?.placesMode ??
    process.env.PLACES_MODE ??
    process.env.PROVIDER_MODE ??
    "fixture") as ProviderMode;
  if (m === "live") return new GooglePlaces(settings, runtime);
  if (m === "cassette")
    return new CassettePlaces(new GooglePlaces(settings, runtime), runtime.cassetteDir);
  return new FixturePlaces(demoBase);
}
