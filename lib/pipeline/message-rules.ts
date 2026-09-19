/**
 * §29 — las reglas del primer toque, verificadas en código.
 *
 * Un prompt que dice "sin enlaces, sin precio, máximo 4 líneas" se cumple casi
 * siempre. "Casi" no sirve: esto lo pega un alumno en un DM a un negocio real,
 * y un mensaje con un link dentro va directo a spam o a ignorado.
 *
 * Mismo criterio que verifyEvidence: la regla vive donde no puede fallar.
 */

export type Issue =
  "enlace" | "precio" | "demasiado_largo" | "demasiadas_lineas" | "jerga" | "sin_pregunta";

const URL_RE = /(https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,}|[a-z0-9-]+\.(com|net|org|io|co)\/)/i;

const PRECIO_RE =
  /(\$\s?\d|\d+\s?(usd|eur|dólares|dolares|euros|pesos)|\bprecio\b|\btarifa\b|\bcuesta\b|\bpricing\b)/i;

// Frases que delatan a un modelo o a una agencia. Ninguna persona escribe así
// en un primer mensaje.
const JERGA_RE =
  /\b(soluciones?\s+de\s+(ia|inteligencia)|potenciar|impulsar\s+tu|revolucionar|sinergia|optimizar\s+tus\s+procesos|leverage|cutting.?edge|game.?changer|unlock\s+the|supercharge|seamless|elevate\s+your)\b/i;

const MAX_LINEAS = 4;
const MAX_CARACTERES = 600;

export function lintMessage(body: string): { ok: boolean; issues: Issue[] } {
  const issues: Issue[] = [];
  const lineas = body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (URL_RE.test(body)) issues.push("enlace");
  if (PRECIO_RE.test(body)) issues.push("precio");
  if (body.length > MAX_CARACTERES) issues.push("demasiado_largo");
  if (lineas.length > MAX_LINEAS) issues.push("demasiadas_lineas");
  if (JERGA_RE.test(body)) issues.push("jerga");
  if (!/[?¿]/.test(body)) issues.push("sin_pregunta");

  return { ok: issues.length === 0, issues };
}

export const EXPLICACIONES: Record<Issue, string> = {
  enlace: "no incluyas enlaces ni dominios",
  precio: "no menciones precios ni tarifas",
  demasiado_largo: `no pases de ${MAX_CARACTERES} caracteres`,
  demasiadas_lineas: `no pases de ${MAX_LINEAS} líneas`,
  jerga: "quita el lenguaje corporativo y de agencia; escribe como una persona",
  sin_pregunta: "cierra con una micro-pregunta fácil de responder",
};

/**
 * Reparación mecánica, último recurso. Solo se aplica si el reintento tampoco
 * pasó el linter, y el alumno ve que el mensaje se ajustó.
 */
export function sanitize(body: string): string {
  const lineas = body
    .split(/\n+/)
    .map((original) => {
      const limpia = original
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/\bwww\.\S+/gi, "")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

      // Solo se juzga la línea que perdió algo. "¿Sí?" es corta y válida;
      // "Mira esto:" sin el enlace detrás ya no dice nada.
      const perdioAlgo = limpia !== original.trim();
      if (perdioAlgo && (limpia.length < 12 || /[:\-–]$/.test(limpia))) return "";
      return limpia;
    })
    .filter(Boolean);

  if (lineas.length <= MAX_LINEAS) return lineas.join("\n");

  // La última línea suele ser la micro-pregunta: recortar por el medio, nunca
  // por el final, o el mensaje se queda sin cierre.
  return [...lineas.slice(0, MAX_LINEAS - 1), lineas[lineas.length - 1]].join("\n");
}
