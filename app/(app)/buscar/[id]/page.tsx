import Link from "next/link";
import { notFound } from "next/navigation";
import { lugarLabel, paisSolo } from "@/lib/catalog";
import { supabaseServer } from "@/lib/supabase/server";
import { SearchRunner } from "@/components/search-runner";
import { ScoreSeam } from "@/components/score-seam";
import { Eyebrow, EmptyState, LinkButton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SaveButton } from "./save-button";
import { SaveAllButton } from "./save-all-button";

type Filtro = "recomendados" | "todos" | "email" | "sin-web";

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "recomendados", label: "Recomendados" },
  { key: "todos", label: "Todos" },
  { key: "email", label: "Con email" },
  { key: "sin-web", label: "Sin website" },
];

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ f?: Filtro }>;
}) {
  const { id } = await params;
  const { f: requestedFilter = "recomendados" } = await searchParams;
  const f = FILTROS.some((filter) => filter.key === requestedFilter)
    ? requestedFilter
    : "recomendados";
  const supabase = await supabaseServer();

  const { data: search, error: searchError } = await supabase
    .from("searches")
    .select(
      "id, niche, city, country, language, mode, status, found_count, candidate_count, qualified_count",
    )
    .eq("id", id)
    .maybeSingle();

  if (searchError) throw new Error("No pudimos cargar la búsqueda.");
  if (!search) notFound();

  const cabecera = (
    <>
      <Link
        href="/buscar"
        className="mb-4 inline-flex min-h-10 items-center text-[12px] text-muted hover:text-gold"
      >
        ← Volver a buscar clientes
      </Link>
      <div className="flex items-center gap-3">
        <Eyebrow>Búsqueda</Eyebrow>
        {search.mode === "demo" && (
          <span className="rounded-full border border-gold px-2.5 py-0.5 text-[10px] font-semibold tracking-widest text-gold">
            DATOS DE EJEMPLO
          </span>
        )}
      </div>
      <h1 className="page-title">
        {search.niche} en {search.city ?? paisSolo(search.country)}
      </h1>
      <p className="mt-3 text-sm text-muted">
        {lugarLabel(search.country, search.city)} ·{" "}
        {search.language === "es" ? "Español" : "English"}
      </p>
    </>
  );

  if (search.status !== "done") {
    return (
      <>
        {cabecera}
        <div className="mt-10">
          <SearchRunner searchId={search.id} />
        </div>
      </>
    );
  }

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select(
      "id, business_name, website_domain, public_email, public_phone, score, score_breakdown, qualified, observed_problem, confidence, candidate, discard_reason, saved",
    )
    .eq("search_id", search.id)
    .order("score", { ascending: false });

  if (leadsError) throw new Error("No pudimos cargar los resultados.");
  const rows = leads ?? [];
  const candidatos = rows.filter((l) => l.candidate);
  const descartados = rows.filter((l) => !l.candidate);

  const visibles = candidatos.filter((l) => {
    if (f === "recomendados") return l.qualified;
    if (f === "email") return !!l.public_email;
    if (f === "sin-web") return !l.website_domain;
    return true;
  });

  return (
    <>
      {cabecera}

      {search.mode === "demo" && (
        <p className="notice mt-6">
          Estos negocios son ficticios. Puedes explorar el flujo completo y guardar tus avances;
          conecta tus servicios en Configuración para encontrar negocios reales.
        </p>
      )}
      <h2 className="display mt-8 text-2xl">
        Encontramos <span className="tnum">{search.found_count}</span> negocios
      </h2>
      <p className="mt-2 text-sm text-muted">
        <span className="text-ink tnum">{search.qualified_count}</span> parecen buenas
        oportunidades.
      </p>

      <div className="mt-6">
        <SaveAllButton
          searchId={search.id}
          recomendados={candidatos.filter((l) => l.qualified && !l.saved).length}
          candidatos={candidatos.filter((l) => !l.saved).length}
        />
      </div>

      <nav aria-label="Filtrar resultados" className="mt-6 flex flex-wrap gap-2">
        {FILTROS.map((filtro) => (
          <Link
            key={filtro.key}
            href={`/buscar/${search.id}?f=${filtro.key}`}
            aria-current={f === filtro.key ? "page" : undefined}
            className={`pill ${
              f === filtro.key
                ? "border-gold text-gold"
                : "border-line text-muted hover:border-line-lit hover:text-ink"
            }`}
          >
            {filtro.label}
          </Link>
        ))}
      </nav>

      {visibles.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No hay negocios con este filtro."
            body="Puedes consultar todos los resultados de esta búsqueda para revisar otras oportunidades."
            action={
              <LinkButton href={`/buscar/${search.id}?f=todos`} variant="ghost">
                Ver todos los resultados
              </LinkButton>
            }
          />
        </div>
      ) : (
        <div className="mt-6 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {visibles.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-4 p-4 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:gap-4 sm:p-5"
            >
              <div>
                <p
                  className={`tnum display text-xl leading-none ${l.qualified ? "text-gold" : "text-muted"}`}
                >
                  {l.score}
                </p>
                <div className="mt-1.5">
                  <ScoreSeam
                    breakdown={l.score_breakdown ?? {}}
                    qualified={l.qualified}
                    height={4}
                  />
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-sm font-medium">{l.business_name}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {l.observed_problem ??
                    "No encontramos una señal clara del problema que resuelves."}
                </p>
                <p className="mt-1.5 text-[12px] text-dim">
                  {[
                    l.website_domain,
                    l.public_email,
                    l.confidence &&
                      `confianza ${l.confidence === "high" ? "alta" : l.confidence === "medium" ? "media" : "baja"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="col-start-2 flex flex-wrap items-start gap-2 sm:col-start-auto">
                <Link
                  href={`/leads/${l.id}`}
                  aria-label={`Ver ${l.business_name}`}
                  className="pill"
                >
                  Ver ficha <Icon name="arrow" width="13" height="13" />
                </Link>
                <SaveButton leadId={l.id} saved={l.saved} />
              </div>
            </div>
          ))}
        </div>
      )}

      {descartados.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-[13px] text-dim hover:text-muted">
            {descartados.length} descartados antes de analizar, y por qué
          </summary>
          <div className="mt-3 divide-y divide-line border-y border-line">
            {descartados.map((l) => (
              <div key={l.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <p className="truncate text-[13px] text-muted">{l.business_name}</p>
                <p className="text-[12px] text-dim">{l.discard_reason}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
