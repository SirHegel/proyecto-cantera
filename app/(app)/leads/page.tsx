import Link from "next/link";
import { ScoreSeam } from "@/components/score-seam";
import { EmptyState, Eyebrow, LinkButton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { supabaseServer } from "@/lib/supabase/server";
import { ESTADOS, type Estado } from "@/lib/crm";

const GRUPOS: { key: string; label: string; estados: Estado[] }[] = [
  {
    key: "activos",
    label: "Activos",
    estados: ["nuevo", "listo", "contactado", "respondio", "demo", "conversacion"],
  },
  { key: "listo", label: "Por contactar", estados: ["nuevo", "listo"] },
  { key: "esperando", label: "Esperando respuesta", estados: ["contactado"] },
  { key: "vivos", label: "En conversación", estados: ["respondio", "demo", "conversacion"] },
  { key: "cerrados", label: "Cerrados", estados: ["cerrado"] },
  { key: "todos", label: "Todos", estados: [] },
];
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; q?: string }>;
}) {
  const { g = "activos", q = "" } = await searchParams;
  const supabase = await supabaseServer();
  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "id, business_name, city, score, score_breakdown, qualified, observed_problem, public_email, public_phone, status, next_followup_at",
    )
    .eq("saved", true)
    .order("score", { ascending: false })
    .limit(200);
  if (error) throw new Error("No pudimos cargar los leads.");
  const rows = leads ?? [];
  const grupo = GRUPOS.find((x) => x.key === g) ?? GRUPOS[0];
  const term = q.trim().toLocaleLowerCase("es");
  const visibles = rows.filter(
    (lead) =>
      (!grupo.estados.length || grupo.estados.includes(lead.status as Estado)) &&
      (!term ||
        [lead.business_name, lead.city, lead.public_email, lead.public_phone].some((value) =>
          String(value ?? "")
            .toLocaleLowerCase("es")
            .includes(term),
        )),
  );
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return (
    <>
      <div className="page-header">
        <div>
          <Eyebrow>De contactos a conversaciones</Eyebrow>
          <h1 className="page-title">Tu cartera de oportunidades.</h1>
          <p className="mt-3 text-sm text-muted">
            <span className="tnum text-ink">{rows.length}</span> leads guardados. El siguiente paso
            lo decides tú.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!!rows.length && (
            <a href="/api/leads/export" className="pill min-h-11">
              <Icon name="download" width="16" height="16" />
              Exportar CSV
            </a>
          )}
          <LinkButton href="/buscar">
            <Icon name="plus" width="16" height="16" />
            Buscar clientes
          </LinkButton>
        </div>
      </div>
      {!rows.length ? (
        <div className="mt-8">
          <EmptyState
            title="Aquí empiezan las buenas conversaciones."
            body="Guarda los negocios que encajen con tu oferta para organizar su estado, preparar mensajes y recordar cuándo volver a escribir."
            action={<LinkButton href="/buscar">Encontrar mis primeros leads</LinkButton>}
          />
        </div>
      ) : (
        <>
          <form
            action="/leads"
            method="get"
            role="search"
            className="mt-7 flex flex-wrap items-end gap-3"
          >
            <input type="hidden" name="g" value={grupo.key} />
            <div className="min-w-0 flex-1">
              <label htmlFor="lead-search" className="field-label text-[12px]">
                Buscar en tus leads guardados
              </label>
              <div className="relative">
                <Icon
                  name="search"
                  className="absolute top-3.5 left-4 text-dim"
                  width="18"
                  height="18"
                />
                <input
                  type="search"
                  name="q"
                  id="lead-search"
                  defaultValue={q}
                  placeholder="Nombre, ciudad, email o teléfono"
                  className="field !bg-surface !pl-11"
                />
              </div>
            </div>
            <button type="submit" className="pill min-h-[47px]">
              Buscar
            </button>
            {q && (
              <Link href={`/leads?g=${grupo.key}`} className="pill min-h-[47px]">
                Limpiar
              </Link>
            )}
          </form>
          <nav aria-label="Filtrar leads por estado" className="mt-5 flex flex-wrap gap-2">
            {GRUPOS.map((x) => {
              const n = x.estados.length
                ? rows.filter((l) => x.estados.includes(l.status as Estado)).length
                : rows.length;
              return (
                <Link
                  key={x.key}
                  href={`/leads?g=${x.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className="pill"
                  aria-current={grupo.key === x.key ? "page" : undefined}
                >
                  {x.label}
                  <span className="tnum rounded bg-line/70 px-1.5 py-0.5 text-[10px]">{n}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 flex items-center justify-between gap-3 text-[11px] text-dim">
            <span>
              {visibles.length} {visibles.length === 1 ? "oportunidad" : "oportunidades"}
              {q && ` para “${q}”`}
            </span>
            <span>Ordenadas por puntuación</span>
          </div>
          {!visibles.length ? (
            <div className="mt-4">
              <EmptyState
                title="No hay leads con este filtro."
                body={
                  q
                    ? "Prueba con otro nombre, ciudad o dato de contacto."
                    : "Los leads aparecerán aquí cuando cambies su estado."
                }
                action={
                  <LinkButton href="/leads?g=todos" variant="ghost">
                    Ver todos los leads
                  </LinkButton>
                }
              />
            </div>
          ) : (
            <div className="mt-3 overflow-hidden rounded-card border border-line bg-surface">
              <div className="hidden grid-cols-[4rem_minmax(0,1fr)_10rem] gap-4 border-b border-line bg-void/40 px-5 py-3 text-[10px] font-medium uppercase tracking-wider text-dim sm:grid">
                <span>Puntos</span>
                <span>Negocio / oportunidad</span>
                <span className="text-right">Estado</span>
              </div>
              <div className="divide-y divide-line">
                {visibles.map((l) => {
                  const overdue = l.next_followup_at && new Date(l.next_followup_at) < hoy;
                  return (
                    <Link
                      key={l.id}
                      href={`/leads/${l.id}`}
                      className="group grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 transition-colors hover:bg-raised/70 sm:grid-cols-[4rem_minmax(0,1fr)_10rem] sm:gap-4 sm:p-5"
                    >
                      <div className="pt-1">
                        <p
                          className={`tnum display text-2xl ${l.qualified ? "text-gold" : "text-muted"}`}
                          aria-label={`Puntuación ${l.score} de 100`}
                        >
                          {l.score}
                        </p>
                        <div className="mt-2 max-w-12">
                          <ScoreSeam
                            breakdown={l.score_breakdown ?? {}}
                            qualified={l.qualified}
                            height={4}
                          />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium group-hover:text-gold">
                          {l.business_name}
                        </p>
                        <p className="mt-1 text-[11px] text-dim">
                          {l.city || "Ubicación no disponible"}
                        </p>
                        <p className="mt-2 text-[12px] leading-relaxed text-muted">
                          {l.observed_problem ??
                            "Revisa el negocio para encontrar un motivo de contacto."}
                        </p>
                        <p className="mt-2 text-[11px] text-dim">
                          {l.public_email ?? l.public_phone ?? "Sin contacto público"}
                        </p>
                      </div>
                      <div className="col-start-2 sm:col-start-auto sm:text-right">
                        <span
                          className={`status-pill ${["cerrado", "respondio", "conversacion"].includes(l.status) ? "!text-[#bed1a9]" : ""}`}
                        >
                          {ESTADOS[l.status as Estado] ?? l.status}
                        </span>
                        {l.next_followup_at && (
                          <p
                            className={`tnum mt-2 text-[11px] ${overdue ? "text-gold" : "text-dim"}`}
                          >
                            {overdue ? "Pendiente · " : "Seguimiento · "}
                            {new Date(l.next_followup_at).toLocaleDateString("es", {
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          {rows.length === 200 && (
            <p className="mt-4 text-[12px] text-dim">
              Mostrando los 200 leads con mayor puntuación. La exportación incluye todos tus leads
              guardados.
            </p>
          )}
        </>
      )}
    </>
  );
}
