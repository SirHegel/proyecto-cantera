/**
 * La veta.
 *
 * Un número solo dice "89". Esto dice de dónde salió el 89: cuatro estratos
 * con el ancho proporcional a su peso máximo (30/35/20/15), cada uno relleno
 * hasta lo que realmente puntuó. Un lead con 70 puntos casi todos de encaje
 * y ninguno de problema se ve distinto a uno con 70 repartidos, y esa
 * diferencia es exactamente la que decide a quién escribir primero.
 *
 * No es decoración: es la §21 hecha visible.
 */

export const CRITERIA = [
  { key: "icp", max: 30, label: "Encaje" },
  { key: "problem", max: 35, label: "Problema" },
  { key: "commercial", max: 20, label: "Negocio" },
  { key: "contact", max: 15, label: "Contacto" },
] as const;

export type ScoreBreakdown = Partial<Record<(typeof CRITERIA)[number]["key"], number>>;

export function ScoreSeam({
  breakdown,
  qualified = false,
  showLegend = false,
  height = 6,
}: {
  breakdown: ScoreBreakdown;
  qualified?: boolean;
  showLegend?: boolean;
  height?: number;
}) {
  // El dorado marca oportunidad, no un umbral numérico.
  //
  // 65 de los 100 puntos miden "existe, está activo y se le puede escribir", y
  // eso casi todo negocio real lo maximiza: un lead SIN ninguna señal del
  // problema saca 71. Pintar de dorado por pasar de 75 habría destacado
  // negocios a los que el alumno no tiene nada que decirles.
  const hot = qualified;

  return (
    <div className="w-full">
      <div className="flex gap-[2px]" style={{ height }} aria-hidden>
        {CRITERIA.map((c) => {
          const got = Math.min(Math.max(breakdown[c.key] ?? 0, 0), c.max);
          return (
            <div
              key={c.key}
              className="relative overflow-hidden rounded-[2px] bg-line"
              style={{ flexGrow: c.max }}
              title={`${c.label} ${got}/${c.max}`}
            >
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-500"
                style={{
                  width: `${(got / c.max) * 100}%`,
                  background: hot ? "var(--color-gold)" : "var(--color-line-lit)",
                }}
              />
            </div>
          );
        })}
      </div>

      {showLegend && (
        <div className="mt-2 flex gap-[2px] text-[10px] text-dim">
          {CRITERIA.map((c) => (
            <div key={c.key} style={{ flexGrow: c.max }} className="tnum truncate">
              {c.label} <span className="text-muted">{Math.min(breakdown[c.key] ?? 0, c.max)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScoreBadge({
  score,
  breakdown,
  qualified = false,
}: {
  score: number;
  breakdown?: ScoreBreakdown;
  qualified?: boolean;
}) {
  const hot = qualified;
  return (
    <div className="flex items-center gap-3">
      <span className={`display tnum text-2xl leading-none ${hot ? "text-gold" : "text-ink"}`}>
        {score}
      </span>
      {breakdown && (
        <div className="w-24">
          <ScoreSeam breakdown={breakdown} qualified={qualified} height={5} />
        </div>
      )}
    </div>
  );
}
