import type { ProviderSettings } from "@/lib/settings";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { cassetteDirectory } from "./cassette-path";
import {
  costOf,
  type AiProvider,
  type AiUsage,
  type AngleResult,
  type MessageResult,
  type OfferHint,
  type ProviderMode,
  type ProviderRuntime,
  type QualifyInput,
  type QualifyResult,
} from "./types";

const BULK = process.env.OPENAI_BULK_MODEL ?? "gpt-5.6-luna";
const QUALITY = process.env.OPENAI_QUALITY_MODEL ?? "gpt-5.6-terra";

// El system prompt se mantiene estable e idéntico entre llamadas: es lo que
// activa el descuento de caché de prefijo (90% sobre el input).
const QUALIFIER_SYSTEM = `Eres el motor de calificación de La Cantera.
Determinas si un negocio es una oportunidad razonable para la oferta del usuario.
Reglas absolutas:
- Usa exclusivamente los datos entregados. No inventes nada.
- No asumas que un problema existe solo porque es común en esa industria.
- Distingue HECHO OBSERVADO de INTERPRETACIÓN.
- Nunca afirmes ingresos, pérdidas, número de clientes, empleados o conversión.
- Cada evidencia debe incluir una cita textual copiada literalmente del texto entregado.
  Si no puedes citar textualmente, no incluyas esa evidencia.
- Si no sabes algo, devuelve null.
- problemFitPoints va de 0 a 35 y mide SOLO qué tan fuerte es la señal del
  problema que el usuario resuelve. Sin señal citable, 0.
Sé breve.`;

const qualifySchema = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "problemFitPoints", "observedProblem", "evidence", "reason", "confidence"],
        properties: {
          id: { type: "string" },
          problemFitPoints: { type: "integer", minimum: 0, maximum: 35 },
          observedProblem: { type: ["string", "null"] },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["claim", "quote", "sourceUrl"],
              properties: {
                claim: { type: "string" },
                quote: { type: "string" },
                sourceUrl: { type: ["string", "null"] },
              },
            },
          },
          reason: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
  },
} as const;

const angleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["observation", "angle", "demoIdea"],
  properties: {
    observation: { type: "string" },
    angle: { type: "string" },
    demoIdea: { type: "string" },
  },
} as const;

const messageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: {
    subject: { type: ["string", "null"] },
    body: { type: "string" },
  },
} as const;

const hintSchema = {
  type: "object",
  additionalProperties: false,
  required: ["problem", "niches"],
  properties: {
    problem: { type: "string" },
    niches: { type: "array", items: { type: "string" } },
  },
} as const;

/**
 * §27 y §29 — el primer toque.
 *
 * Un DM de Instagram y un correo no son el mismo texto con distinto envoltorio:
 * cambian el largo, el registro, quién lee y con qué expectativa. Mandar el
 * mismo párrafo a los tres canales es lo que hace que un mensaje "huela a
 * plantilla" aunque el ángulo sea bueno.
 */
const BASE_OUTREACH = `Eres un redactor de cold outreach permission-first.
Tu objetivo NO es vender: es conseguir permiso para mostrar una idea.
Usa exclusivamente el ángulo entregado. No inventes nada.
Sin enlaces, sin precios, sin Calendly, sin jerga corporativa ni de agencia.
Termina siempre con una micro-pregunta fácil de responder con una palabra.`;

const POR_CANAL: Record<string, string> = {
  email: `CANAL: correo en frío.
Lo lee el dueño o quien gestiona la bandeja, entre decenas de correos.
- Asunto: 3 a 6 palabras, en minúsculas, concreto y sin promesa. Que parezca
  escrito por una persona que vio algo, no por una campaña.
- Cuerpo: 3 o 4 líneas cortas, cada una en su propia línea.
- Primera línea: la observación concreta de su negocio. Nada de "espero que
  estés bien" ni presentaciones.
- Sin firma ni despedida formal.`,

  instagram: `CANAL: mensaje directo de Instagram.
Lo lee alguien en el móvil, mezclado con mensajes personales.
- Sin asunto: devuelve null en subject.
- 2 o 3 líneas MUY cortas. Más largo que eso no se lee.
- Tono de mensaje entre personas, no de empresa. Se permite tutear.
- Puede empezar en minúscula. Nada de "Estimado" ni "Le escribo para".
- Sin emojis salvo que aporten claridad, y como mucho uno.`,

  linkedin: `CANAL: mensaje de LinkedIn.
Lo lee un profesional en contexto de trabajo y espera criterio, no simpatía.
- Sin asunto: devuelve null en subject.
- 3 o 4 líneas. Registro profesional pero sin pomposidad.
- Nombra el negocio y lo que se observó de él, para que quede claro que no es
  un envío masivo.
- Nada de "me encantaría conectar" ni "explorar sinergias".`,
};

class OpenAiProvider implements AiProvider {
  readonly mode: ProviderMode = "live";
  private client: OpenAI;
  constructor(settings?: ProviderSettings, runtime: ProviderRuntime = {}) {
    this.client = new OpenAI({
      apiKey: settings?.openaiKey || process.env.OPENAI_API_KEY,
      timeout: runtime.timeoutMs ?? 60_000,
      maxRetries: 0,
      fetch: runtime.fetch,
    });
  }

  private async call<T>(
    model: string,
    system: string,
    user: string,
    schema: unknown,
    name: string,
    effort: "none" | "low",
  ) {
    let res;
    try {
      res = await this.client.responses.create({
        model,
        store: false,
        reasoning: { effort } as never,
        max_output_tokens: 5000,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        text: { format: { type: "json_schema", name, schema, strict: true } } as never,
      });
    } catch (error) {
      if (error instanceof OpenAI.APIConnectionTimeoutError)
        throw new Error("La IA tardó demasiado en responder. Inténtalo de nuevo.");
      if (error instanceof OpenAI.APIError)
        throw new Error(
          `La IA no respondió correctamente${error.status ? ` (HTTP ${error.status})` : ""}. Revisa la conexión, la clave y las cuotas.`,
        );
      throw error;
    }

    const inTok = res.usage?.input_tokens ?? 0;
    const outTok = res.usage?.output_tokens ?? 0;
    const usage: AiUsage = {
      model,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: costOf(model, inTok, outTok),
    };
    if (res.status !== "completed" || !res.output_text?.trim())
      throw new Error("La IA devolvió una respuesta incompleta. Reintenta el análisis.");
    let data: unknown;
    try {
      data = JSON.parse(res.output_text);
    } catch {
      throw new Error("La IA devolvió JSON inválido. Inténtalo de nuevo.");
    }
    if (!matchesSchema(data, schema as ResponseSchema))
      throw new Error("La IA devolvió datos con un formato inválido. Inténtalo de nuevo.");
    return { data: data as T, usage };
  }

  async qualifyBatch(
    offer: { whatISell: string; problemSolved?: string; niche: string },
    items: QualifyInput[],
  ) {
    const user = JSON.stringify({ offer, businesses: items });
    const { data, usage } = await this.call<{ results: QualifyResult[] }>(
      BULK,
      QUALIFIER_SYSTEM,
      user,
      qualifySchema,
      "qualification",
      "none",
    );
    return { results: verifyEvidence(data.results, items), usage };
  }

  async inferProblem(whatISell: string) {
    const system = `Eres analista comercial de La Cantera.
A partir de la descripción de un servicio, devuelves:
- problem: en UNA frase, el problema concreto que ese servicio resuelve para el
  cliente final, escrito como lo diría el dueño del negocio, no como marketing.
- niches: entre 2 y 4 tipos de negocio donde ese problema es más frecuente.
No inventes cifras. No uses jerga de agencia. Español neutro.`;
    const { data, usage } = await this.call<OfferHint>(
      QUALITY,
      system,
      whatISell,
      hintSchema,
      "offer_hint",
      "low",
    );
    return { result: data, usage };
  }

  async generateAngle(ctx: Record<string, unknown>) {
    const system = `Eres el investigador comercial de La Cantera.
A partir únicamente de la evidencia disponible generas un motivo concreto y humano
para contactar a este negocio. El ángulo debe demostrar que investigamos ESE negocio.
Prohibido: frases genéricas sobre IA, afirmaciones de pérdidas o ingresos, inventar.`;
    const { data, usage } = await this.call<AngleResult>(
      QUALITY,
      system,
      JSON.stringify(ctx),
      angleSchema,
      "angle",
      "low",
    );
    return { result: data, usage };
  }

  async generateMessage(ctx: Record<string, unknown>, channel: string, language: string) {
    const system = `${BASE_OUTREACH}\n\n${POR_CANAL[channel] ?? POR_CANAL.email}\n\nIdioma: ${
      language === "en" ? "inglés natural de negocios, nada rebuscado" : "español natural de España"
    }.`;
    const { data, usage } = await this.call<MessageResult>(
      QUALITY,
      system,
      JSON.stringify(ctx),
      messageSchema,
      "message",
      "low",
    );
    return { result: data, usage };
  }
}

/**
 * La regla anti-alucinación como código, no como prompt.
 * Toda evidencia cuya cita no aparezca literalmente en el texto se descarta.
 * Si un problema se queda sin evidencia, su puntaje cae a 0.
 */
export function verifyEvidence(results: QualifyResult[], items: QualifyInput[]): QualifyResult[] {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const byId = new Map(items.map((i) => [i.id, norm(i.websiteText)]));

  const seen = new Set<string>();
  if (!Array.isArray(results)) throw new Error("La IA devolvió una lista de resultados inválida.");
  return results
    .filter(
      (r) =>
        r &&
        typeof r === "object" &&
        typeof r.id === "string" &&
        byId.has(r.id) &&
        !seen.has(r.id) &&
        !!seen.add(r.id),
    )
    .map((r) => {
      const haystack = byId.get(r.id) ?? "";
      const kept = (Array.isArray(r.evidence) ? r.evidence : [])
        .filter(
          (e) =>
            e &&
            typeof e.claim === "string" &&
            typeof e.quote === "string" &&
            norm(e.quote).length >= 8 &&
            haystack.includes(norm(e.quote)),
        )
        // The extractor supplies the real source URL. Model-provided URLs are not evidence.
        .map((e) => ({ claim: e.claim, quote: e.quote, sourceUrl: null }));
      if (kept.length === 0) {
        return {
          ...r,
          evidence: [],
          problemFitPoints: 0,
          observedProblem: null,
          reason: "No encontramos evidencia verificable en el texto de la web.",
          confidence: "low" as const,
        };
      }
      return {
        ...r,
        problemFitPoints: Number.isFinite(r.problemFitPoints)
          ? Math.max(0, Math.min(35, Math.round(r.problemFitPoints)))
          : 0,
        evidence: kept,
      };
    });
}

type ResponseSchema = {
  type: string | readonly string[];
  properties?: Record<string, ResponseSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: ResponseSchema;
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
};

/** Validate the same schema locally before any model output reaches the CRM. */
function matchesSchema(value: unknown, schema: ResponseSchema): boolean {
  const types = typeof schema.type === "string" ? [schema.type] : schema.type;
  const typeMatches = types.some((type) =>
    type === "null"
      ? value === null
      : type === "array"
        ? Array.isArray(value)
        : type === "object"
          ? !!value && typeof value === "object" && !Array.isArray(value)
          : type === "integer"
            ? Number.isInteger(value)
            : type === "string"
              ? typeof value === "string" && !!value.trim()
              : typeof value === type,
  );
  if (!typeMatches || (schema.enum && !schema.enum.includes(value))) return false;
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) ||
      (schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum))
  )
    return false;
  if (Array.isArray(value))
    return !schema.items || value.every((item) => matchesSchema(item, schema.items!));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (schema.required?.some((key) => !Object.hasOwn(record, key))) return false;
    if (
      schema.additionalProperties === false &&
      Object.keys(record).some((key) => !Object.hasOwn(schema.properties ?? {}, key))
    )
      return false;
    return Object.entries(record).every(
      ([key, item]) => !schema.properties?.[key] || matchesSchema(item, schema.properties[key]),
    );
  }
  return true;
}

// --- Fixture: determinista, 0 llamadas -------------------------------------

class FixtureAi implements AiProvider {
  readonly mode: ProviderMode = "fixture";
  private zero: AiUsage = { model: "fixture", inputTokens: 0, outputTokens: 0, costUsd: 0 };

  async qualifyBatch(_o: unknown, items: QualifyInput[]) {
    const results: QualifyResult[] = items.map((i, n) => {
      const weak = !i.hasBookingLink && i.hasPhone;
      const quote =
        i.websiteText
          .split(/[.\n]/)
          .find((s) => s.trim().length > 25)
          ?.trim() ?? "";
      return {
        id: i.id,
        problemFitPoints: weak ? 28 - (n % 3) * 4 : 12,
        observedProblem: weak
          ? "No encontramos una opción visible para reservar online desde la página principal."
          : null,
        evidence: quote ? [{ claim: "Texto visible en la home", quote, sourceUrl: null }] : [],
        reason: weak ? "El CTA principal dirige al usuario a llamar." : "Señales débiles.",
        confidence: weak ? "medium" : "low",
      };
    });
    return { results: verifyEvidence(results, items), usage: this.zero };
  }

  async inferProblem(whatISell: string) {
    const foco = whatISell.slice(0, 60).trim();
    return {
      result: {
        problem: `Pierden oportunidades porque nadie responde a tiempo (a partir de: ${foco}…)`,
        niches: ["Clínicas dentales", "Clínicas estéticas / Med spas", "Inmobiliarias"],
      } as OfferHint,
      usage: this.zero,
    };
  }

  async generateAngle(ctx: Record<string, unknown>) {
    return {
      result: {
        observation: "La página lleva al visitante a llamar para reservar.",
        angle:
          "Vi que hoy la única vía para agendar es el teléfono. Preparé una forma de responder y calificar consultas nuevas antes de que se enfríen.",
        demoIdea: "Recepcionista que contesta en menos de un minuto y agenda sin intervención.",
      } as AngleResult,
      usage: this.zero,
    };
  }

  async generateMessage(_ctx: Record<string, unknown>, channel: string, language: string) {
    if (language === "en") {
      return {
        result: {
          subject: channel === "email" ? "an idea for appointment requests" : null,
          body: "I noticed that your website directs visitors to call for an appointment.\nI have an idea to make those requests easier to handle.\nWould you like to see it?",
        },
        usage: this.zero,
      };
    }
    const porCanal: Record<string, MessageResult> = {
      email: {
        subject: "reservas solo por teléfono",
        body: "Vi que en la web la única forma de agendar es llamando.\nArmé una manera de responder esas consultas al instante y dejar la cita puesta.\nTardo dos minutos en enseñártelo.\n¿Te lo mando?",
      },
      instagram: {
        subject: null,
        body: "hola, vi que para pedir cita hay que llamar sí o sí\ntengo una forma de que se agenden solos sin que nadie conteste\n¿te la enseño?",
      },
      linkedin: {
        subject: null,
        body: "Vi que la clínica recibe las solicitudes de cita únicamente por teléfono.\nPreparé una forma de responder y calificar esas consultas antes de que se enfríen.\nNo es una propuesta, es una idea concreta para vuestro caso.\n¿Os la comparto?",
      },
    };
    return { result: porCanal[channel] ?? porCanal.email, usage: this.zero };
  }
}

// --- Cassette ---------------------------------------------------------------

class CassetteAi implements AiProvider {
  readonly mode: ProviderMode = "cassette";
  constructor(
    private live: () => AiProvider = () => new OpenAiProvider(),
    private directory = cassetteDirectory("ai"),
  ) {}

  private async replay<T extends { usage: AiUsage }>(
    tag: string,
    payload: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    const hash = createHash("sha1")
      .update(tag + JSON.stringify(payload))
      .digest("hex")
      .slice(0, 16);
    const file = path.join(this.directory, `${tag}-${hash}.json`);
    let contents: string | undefined;
    try {
      contents = await fs.readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("No pudimos leer la grabación de IA.");
    }
    if (contents !== undefined) {
      let cached: T;
      try {
        cached = JSON.parse(contents);
      } catch {
        throw new Error("La grabación de IA contiene JSON inválido.");
      }
      if (!cached?.usage || typeof cached.usage.model !== "string")
        throw new Error("La grabación de IA tiene un formato inválido.");
      return {
        ...cached,
        usage: {
          ...cached.usage,
          model: `cassette:${cached.usage.model}`,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        },
      };
    } else {
      const fresh = await run();
      await fs.mkdir(this.directory, { recursive: true });
      await fs.writeFile(file, JSON.stringify(fresh, null, 2));
      return fresh;
    }
  }

  qualifyBatch(o: any, items: QualifyInput[]) {
    return this.replay("qualify", { o, items }, () => this.live().qualifyBatch(o, items));
  }
  inferProblem(whatISell: string) {
    return this.replay("hint", whatISell, () => this.live().inferProblem(whatISell));
  }
  generateAngle(ctx: Record<string, unknown>) {
    return this.replay("angle", ctx, () => this.live().generateAngle(ctx));
  }
  generateMessage(ctx: Record<string, unknown>, ch: any, lang: any) {
    return this.replay("message", { ctx, ch, lang }, () =>
      this.live().generateMessage(ctx, ch, lang),
    );
  }
}

/** AI_MODE manda sobre PROVIDER_MODE: los dos proveedores se activan por separado. */
export function getAiProvider(
  mode?: ProviderMode,
  settings?: ProviderSettings,
  runtime: ProviderRuntime = {},
): AiProvider {
  const m = (mode ??
    settings?.aiMode ??
    process.env.AI_MODE ??
    process.env.PROVIDER_MODE ??
    "fixture") as ProviderMode;
  if (m === "live") return new OpenAiProvider(settings, runtime);
  if (m === "cassette")
    return new CassetteAi(() => new OpenAiProvider(settings, runtime), runtime.cassetteDir);
  return new FixtureAi();
}
