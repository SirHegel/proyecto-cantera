import { fetchWebsiteHtml } from "./safe-fetch";
import { createHash } from "node:crypto";
import { Parser } from "htmlparser2";

/**
 * §18 — leer la web de un negocio lo más barato posible.
 *
 * fetch de HTTP normal. Sin navegador headless, sin crawler. Como máximo dos
 * páginas: la home y, si hay un enlace claro, la de contacto. El texto que sale
 * de aquí es lo único que verá el modelo, y va con un techo estricto de
 * caracteres porque cada uno se paga.
 */

const MAX_CHARS = Number(process.env.MAX_WEBSITE_CHARS ?? 3500);
const TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS ?? 5000);
const CONCURRENCY = Number(process.env.FETCH_CONCURRENCY ?? 8);
const MAX_BYTES = 500_000;

export type Signals = {
  hasWebsite: boolean;
  publicEmail: string | null;
  publicPhone: string | null;
  hasForm: boolean;
  hasBookingLink: boolean;
  hasWhatsapp: boolean;
  mainCta: string | null;
  socialLinks: Record<string, string>;
};

export type Extraction = Signals & {
  status: "ok" | "unreachable" | "none";
  text: string;
  hash: string | null;
  sourceUrl: string | null;
};

/**
 * Detección de reserva online.
 *
 * Buscar la subcadena "book" es una trampa: `facebook.com/negocio` la contiene.
 * Un dentista con Facebook quedaría marcado como si tuviera reserva online, y
 * eso mata justo la oportunidad que este producto existe para encontrar.
 * Por eso: dominios de agendamiento conocidos, o la palabra en el path con
 * barra delante, o una frase de acción completa en el texto del enlace.
 */
const RESERVA_HOSTS =
  /(calendly\.com|acuityscheduling|zocdoc|setmore|schedulicity|simplybook|squareup\.com\/appointments|doctoralia|docplanner)/i;

const RESERVA_PATH =
  /\/(book|booking|appointments?|schedule|citas?|reservar?|agendar|turnos)(\/|$|\?|#)/i;

const RESERVA_TEXTO =
  /\b(book\s+(now|online|an?\s|your)|booking|appointment|schedule\s+(an?|your|online)|reservar|reserva\s+(online|tu|su)|agendar|pedir\s+cita|solicitar\s+cita|pide\s+tu\s+cita)/i;

const ACCION = [
  "book",
  "schedule",
  "call",
  "contact",
  "get",
  "request",
  "start",
  "claim",
  "free",
  "reservar",
  "agendar",
  "llamar",
  "contactar",
  "pedir",
  "solicitar",
  "empezar",
];

const REDES: Record<string, RegExp> = {
  instagram: /instagram\.com\//i,
  facebook: /facebook\.com\//i,
  linkedin: /linkedin\.com\//i,
  tiktok: /tiktok\.com\//i,
  youtube: /youtube\.com\/|youtu\.be\//i,
};

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Filtra ruido real (SDKs, placeholders de plantilla, nombres de imagen) sin
// tumbar dominios legítimos. "example" a secas descartaba correos válidos.
const BASURA_EMAIL =
  /(@sentry\.|sentry\.io|wixpress|@example\.(com|org|net)|your@|email@domain|@2x|\.(png|jpe?g|webp|gif|svg)$)/i;

type Parsed = {
  text: string;
  links: { href: string; text: string }[];
  hasForm: boolean;
};

/** Parseo en streaming: nunca se construye un DOM completo en memoria. */
export function parseHtml(html: string): Parsed {
  const chunks: string[] = [];
  const links: { href: string; text: string }[] = [];
  let hasForm = false;

  let ignorar = 0;
  let hrefActual: string | null = null;
  let textoAncla = "";

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === "script" || name === "style" || name === "noscript") ignorar++;
        if (name === "form") hasForm = true;
        if (name === "a" && attrs.href) {
          hrefActual = attrs.href;
          textoAncla = "";
        }
      },
      ontext(t) {
        if (ignorar > 0) return;
        const limpio = t.replace(/\s+/g, " ");
        if (limpio.trim()) chunks.push(limpio);
        if (hrefActual !== null) textoAncla += limpio;
      },
      onclosetag(name) {
        if (name === "script" || name === "style" || name === "noscript") {
          ignorar = Math.max(0, ignorar - 1);
        }
        if (name === "a" && hrefActual !== null) {
          links.push({ href: hrefActual, text: textoAncla.replace(/\s+/g, " ").trim() });
          hrefActual = null;
          textoAncla = "";
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );

  parser.write(html);
  parser.end();

  return { text: chunks.join(" ").replace(/\s+/g, " ").trim(), links, hasForm };
}

export function signalsFrom(parsed: Parsed, html: string): Signals {
  const hrefs = parsed.links.map((l) => l.href);

  const mailto = hrefs.find((h) => h.toLowerCase().startsWith("mailto:"));
  let email: string | null = null;
  if (mailto) {
    try {
      const candidate = decodeURIComponent(mailto.slice(7).split("?")[0]);
      if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(candidate) && candidate.length <= 254)
        email = candidate;
    } catch {
      /* malformed mailto links are ignored */
    }
  }
  if (!email) {
    const m = parsed.text.match(EMAIL_RE);
    if (m && !BASURA_EMAIL.test(m[0])) email = m[0];
  }
  if (email && BASURA_EMAIL.test(email)) email = null;

  const tel = hrefs.find((h) => h.toLowerCase().startsWith("tel:"));

  const hasBookingLink = parsed.links.some(
    (l) => RESERVA_HOSTS.test(l.href) || RESERVA_PATH.test(l.href) || RESERVA_TEXTO.test(l.text),
  );

  const hasWhatsapp = /wa\.me\/|api\.whatsapp\.com/i.test(html);

  // CTA principal: el primer enlace corto cuyo texto empieza por un verbo de acción.
  const cta =
    parsed.links.find((l) => {
      const t = l.text.toLowerCase();
      return t.length > 2 && t.length < 40 && ACCION.some((v) => t.startsWith(v));
    })?.text ?? null;

  const socialLinks: Record<string, string> = {};
  for (const [red, re] of Object.entries(REDES)) {
    const hit = hrefs.find((h) => re.test(h));
    if (hit) socialLinks[red] = hit;
  }

  return {
    hasWebsite: true,
    publicEmail: email?.toLowerCase() ?? null,
    publicPhone: tel ? tel.slice(4).trim() : null,
    hasForm: parsed.hasForm,
    hasBookingLink,
    hasWhatsapp,
    mainCta: cta,
    socialLinks,
  };
}

/** Un solo enlace de contacto, el más evidente. Nada de recorrer el sitio. */
export function contactUrl(links: { href: string; text: string }[], base: string): string | null {
  const candidato = links.find((l) => {
    const s = `${l.href} ${l.text}`.toLowerCase();
    return /contact|contacto|contactenos|contact-us/.test(s);
  });
  if (!candidato) return null;
  try {
    const u = new URL(candidato.href, base);
    return u.origin === new URL(base).origin ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function extractSite(
  websiteUrl: string | null,
  demoOrigin?: string,
): Promise<Extraction> {
  const vacio: Extraction = {
    status: "none",
    text: "",
    hash: null,
    sourceUrl: null,
    hasWebsite: false,
    publicEmail: null,
    publicPhone: null,
    hasForm: false,
    hasBookingLink: false,
    hasWhatsapp: false,
    mainCta: null,
    socialLinks: {},
  };

  if (!websiteUrl) return vacio;

  const home = await fetchWebsiteHtml(websiteUrl, {
    demoOrigin,
    timeout: TIMEOUT,
    maxBytes: MAX_BYTES,
  });
  if (!home) return { ...vacio, status: "unreachable", sourceUrl: websiteUrl };

  const parsedHome = parseHtml(home);
  let signals = signalsFrom(parsedHome, home);
  let texto = parsedHome.text;

  // Segunda y última página: contacto, solo si falta el email.
  if (!signals.publicEmail) {
    const url = contactUrl(parsedHome.links, websiteUrl);
    if (url) {
      const contacto = await fetchWebsiteHtml(url, {
        demoOrigin,
        timeout: TIMEOUT,
        maxBytes: MAX_BYTES,
      });
      if (contacto) {
        const p2 = parseHtml(contacto);
        const s2 = signalsFrom(p2, contacto);
        signals = {
          ...signals,
          publicEmail: signals.publicEmail ?? s2.publicEmail,
          publicPhone: signals.publicPhone ?? s2.publicPhone,
          hasForm: signals.hasForm || s2.hasForm,
          hasBookingLink: signals.hasBookingLink || s2.hasBookingLink,
        };
        texto = `${texto} ${p2.text}`;
      }
    }
  }

  const recortado = texto.slice(0, MAX_CHARS);

  return {
    ...signals,
    status: "ok",
    text: recortado,
    hash: createHash("sha1").update(recortado).digest("hex").slice(0, 16),
    sourceUrl: websiteUrl,
  };
}

/** Pool de concurrencia acotada: 30 fetches a la vez tumban la función. */
export async function mapPool<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit = CONCURRENCY,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;

  const concurrency = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 8;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  });

  await Promise.all(workers);
  return out;
}
