"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CANTIDADES, IDIOMAS, NICHOS, PAISES, idiomaSugerido, lugarLabel } from "@/lib/catalog";
import { startSearch, suggestProblem } from "@/app/(app)/buscar/actions";
import { Button } from "./ui";
import { Icon } from "./icons";

type Draft = {
  whatISell: string;
  problemSolved: string;
  niche: string;
  country: string;
  city: string;
  language: "es" | "en";
  targetCount: number;
  demo: boolean;
};
const PASOS = ["Tu oferta", "Tu cliente ideal", "El mercado", "Confirmar"];
export function SearchWizard({
  initial,
  localMode = false,
  providersReady = false,
}: {
  initial?: Partial<Draft>;
  localMode?: boolean;
  providersReady?: boolean;
}) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const [d, setD] = useState<Draft>({
    whatISell:
      initial?.whatISell ||
      (localMode
        ? "Instalo recepcionistas con IA para clínicas dentales que responden consultas y organizan sus citas."
        : ""),
    problemSolved: initial?.problemSolved ?? "",
    niche: initial?.niche ?? (localMode ? "Clínicas dentales" : ""),
    country: initial?.country ?? "US",
    city: initial?.city ?? (localMode ? "Miami" : ""),
    language: initial?.language ?? "es",
    targetCount: initial?.targetCount ?? 25,
    demo: initial?.demo ?? !providersReady,
  });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setError(null);
    setD((prev) => ({ ...prev, [key]: value }));
  };
  const ready =
    step === 0 ? d.whatISell.trim().length >= 10 : step === 1 ? d.niche.trim().length >= 2 : true;
  const go = (value: number) => {
    setStep(value);
    setError(null);
    requestAnimationFrame(() => heading.current?.focus());
  };
  function suggest() {
    setError(null);
    start(async () => {
      try {
        const res = await suggestProblem(d.whatISell);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        set("problemSolved", res.data.problem);
        setHint(res.data.niches);
      } catch {
        setError("No pudimos preparar la sugerencia. Puedes escribir el problema y continuar.");
      }
    });
  }
  function search() {
    setError(null);
    start(async () => {
      try {
        const res = await startSearch({ ...d, demo: d.demo });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        router.push(`/buscar/${res.data.id}`);
      } catch {
        setError("No pudimos iniciar la búsqueda. Revisa tu conexión y vuelve a intentarlo.");
      }
    });
  }
  const cities = PAISES.find((p) => p.code === d.country)?.ciudades ?? [];
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <ol
        className="grid grid-cols-4 border-b border-line bg-void/30 p-4 sm:px-6 sm:py-5"
        aria-label="Progreso de la búsqueda"
      >
        {PASOS.map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2"
          >
            <span
              className={`tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] ${i <= step ? "border-gold/40 bg-gold/10 text-gold" : "border-line text-dim"}`}
            >
              {i < step ? <Icon name="check" width="13" height="13" /> : i + 1}
            </span>
            <span
              className={`text-[10px] sm:text-[12px] ${step === i ? "font-medium text-ink" : "text-dim"}`}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          if (step === 3) search();
          else if (ready) go(step + 1);
        }}
        className="p-5 sm:p-8"
      >
        <div className="min-h-[340px]">
          <p className="eyebrow mb-3">Paso {step + 1} de 4</p>
          <h2 ref={heading} tabIndex={-1} className="display text-2xl leading-tight outline-none">
            {
              [
                "¿Qué puedes hacer por tu próximo cliente?",
                "¿Con qué negocios quieres conectar?",
                "¿Dónde está tu próxima oportunidad?",
                "Todo listo para encontrar oportunidades.",
              ][step]
            }
          </h2>
          {step === 0 && (
            <>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Una oferta concreta nos ayuda a encontrar señales relevantes.
              </p>
              <label htmlFor="offer-description" className="field-label mt-6">
                ¿Qué vendes? <span className="text-gold">*</span>
              </label>
              <textarea
                id="offer-description"
                value={d.whatISell}
                onChange={(e) => set("whatISell", e.target.value)}
                rows={4}
                maxLength={3000}
                placeholder="Por ejemplo: automatizo la recepción y las citas de clínicas dentales."
                className="field"
                aria-describedby="offer-help"
              />
              <p id="offer-help" className="mt-2 text-[11px] text-dim">
                Describe tu servicio y a quién ayuda. Mínimo 10 caracteres.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="offer-problem" className="field-label !mb-0">
                  ¿Qué problema solucionas? <span className="text-[11px] text-dim">Opcional</span>
                </label>
                <button
                  type="button"
                  onClick={suggest}
                  disabled={pending || d.whatISell.trim().length < 20}
                  className="inline-flex min-h-10 items-center gap-1.5 text-[12px] text-gold disabled:opacity-40"
                >
                  <Icon name="sparkles" width="14" height="14" />
                  {pending ? "Preparando sugerencia…" : "Ayúdame a definirlo"}
                </button>
              </div>
              <textarea
                id="offer-problem"
                value={d.problemSolved}
                onChange={(e) => set("problemSolved", e.target.value)}
                rows={2}
                maxLength={3000}
                placeholder="Pierden consultas porque tardan en responder."
                className="field mt-2"
              />
            </>
          )}
          {step === 1 && (
            <>
              <p className="mt-3 text-[13px] text-muted">
                Elige un sector o escribe uno más específico.
              </p>
              {hint && (
                <p className="notice mt-5">
                  Tu oferta puede encajar con {hint.slice(0, 3).join(", ")}.
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Tipo de negocio">
                {NICHOS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set("niche", n)}
                    aria-pressed={d.niche === n}
                    className="pill"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <label htmlFor="custom-niche" className="field-label mt-6">
                O escribe otro tipo de negocio
              </label>
              <input
                id="custom-niche"
                value={NICHOS.includes(d.niche as never) ? "" : d.niche}
                onChange={(e) => set("niche", e.target.value)}
                maxLength={120}
                placeholder="Por ejemplo: centros de fisioterapia"
                className="field"
              />
              {d.demo && (
                <p className="mt-4 text-[12px] leading-relaxed text-dim">
                  En la demostración exploraremos el catálogo de clínicas dentales de ejemplo,
                  independientemente del sector elegido.
                </p>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <p className="mt-3 text-[13px] text-muted">
                Elige el mercado y el idioma para tus conversaciones.
              </p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="search-country" className="field-label">
                    País
                  </label>
                  <select
                    id="search-country"
                    className="field"
                    value={d.country}
                    onChange={(e) => {
                      set("country", e.target.value);
                      set("language", idiomaSugerido(e.target.value));
                      set("city", "");
                    }}
                  >
                    {PAISES.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="search-city" className="field-label">
                    Ciudad <span className="text-[11px] text-dim">Opcional</span>
                  </label>
                  <input
                    id="search-city"
                    list="search-cities"
                    className="field"
                    value={d.city}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="Todo el país"
                    maxLength={120}
                  />
                  <datalist id="search-cities">
                    {cities.map((city) => (
                      <option value={city} key={city} />
                    ))}
                  </datalist>
                </div>
              </div>
              <fieldset className="mt-7">
                <legend className="field-label">Idioma de los mensajes</legend>
                <div className="flex gap-2">
                  {IDIOMAS.map((i) => (
                    <button
                      key={i.code}
                      type="button"
                      className="pill"
                      aria-pressed={d.language === i.code}
                      onClick={() => set("language", i.code)}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-dim">
                  Puedes escribir en español aunque busques en otro país.
                </p>
              </fieldset>
              {d.demo && (
                <p className="notice mt-6">
                  La demostración usa negocios ficticios de Miami. Tus preferencias quedan listas
                  para una búsqueda conectada.
                </p>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Revisa los detalles antes de empezar.
              </p>
              <dl className="mt-6 divide-y divide-line">
                {[
                  ["Negocios", d.demo ? "Clínicas dentales (ejemplo)" : d.niche],
                  ["Lugar", d.demo ? "Miami, Estados Unidos" : lugarLabel(d.country, d.city)],
                  ["Idioma", d.language === "es" ? "Español" : "English"],
                  ["Tu oferta", d.whatISell],
                ].map(([key, value]) => (
                  <div key={key} className="grid gap-1 py-3 sm:grid-cols-[6rem_1fr] sm:gap-4">
                    <dt className="text-[12px] text-dim">{key}</dt>
                    <dd className="text-[13px] leading-relaxed">{value}</dd>
                  </div>
                ))}
              </dl>
              {!d.demo && (
                <fieldset className="mt-6">
                  <legend className="field-label">Máximo de negocios a buscar</legend>
                  <div className="flex flex-wrap gap-2">
                    {CANTIDADES.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="pill tnum"
                        aria-pressed={d.targetCount === n}
                        onClick={() => set("targetCount", n)}
                      >
                        {n} negocios
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              <label className="notice mt-5 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={d.demo}
                  onChange={(e) => set("demo", e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <strong className="block font-medium text-ink">
                    {"Probar con datos de ejemplo"}
                  </strong>
                  Sin consumo de búsquedas ni llamadas a servicios externos. Usaremos el catálogo de
                  clínicas dentales ficticias de Miami.
                </span>
              </label>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="error-message mt-5">
            {error}
          </p>
        )}
        <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5">
          <button
            type="button"
            onClick={() => go(Math.max(0, step - 1))}
            disabled={step === 0 || pending}
            className="min-h-11 px-2 text-[13px] text-muted hover:text-ink disabled:cursor-default disabled:opacity-30"
          >
            ← Atrás
          </button>
          <Button type="submit" disabled={!ready || pending}>
            {pending ? "Preparando…" : step === 3 ? "Encontrar clientes" : "Continuar"}
            <Icon name={step === 3 ? "search" : "arrow"} width="16" height="16" />
          </Button>
        </div>
      </form>
    </div>
  );
}
