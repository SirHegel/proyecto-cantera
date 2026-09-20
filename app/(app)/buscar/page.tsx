import Link from "next/link";
import { SearchWizard } from "@/components/search-wizard";
import { Icon } from "@/components/icons";
import { Eyebrow } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase/server";
import { isLocalMode } from "@/lib/runtime";
import { getProviderStatus } from "@/lib/settings";

const HISTORY_PAGE_SIZE = 8;

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { page: pageParam } = await searchParams;
  const parsedPage =
    typeof pageParam === "string" && /^[1-9]\d*$/.test(pageParam) ? Number(pageParam) : 1;
  const requestedPage = Number.isSafeInteger(parsedPage) ? parsedPage : 1;
  const supabase = await supabaseServer();
  const [{ data: offer }, { count, error: countError }, providers] = await Promise.all([
    supabase
      .from("offers")
      .select("what_i_sell, problem_solved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("searches").select("id", { count: "exact", head: true }),
    getProviderStatus(),
  ]);
  if (countError) throw new Error("No pudimos cargar el historial de búsquedas.");
  const totalSearches = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalSearches / HISTORY_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const from = (page - 1) * HISTORY_PAGE_SIZE;
  const { data: searches, error: searchesError } = await supabase
    .from("searches")
    .select("id, niche, city, status, mode, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + HISTORY_PAGE_SIZE - 1);
  if (searchesError) throw new Error("No pudimos cargar el historial de búsquedas.");
  return (
    <>
      <div className="page-header">
        <div>
          <Eyebrow>Encuentra tu siguiente oportunidad</Eyebrow>
          <h1 className="page-title">Clientes con los que puedes conectar.</h1>
          <p className="mt-3 text-sm text-muted">
            Tu oferta es el punto de partida. Nosotros te ayudamos con el contexto.
          </p>
        </div>
      </div>
      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_270px]">
        <SearchWizard
          localMode={isLocalMode()}
          providersReady={
            providers.mode === "live" && providers.configured.places && providers.configured.ai
          }
          initial={{
            whatISell: offer?.what_i_sell ?? "",
            problemSolved: offer?.problem_solved ?? "",
          }}
        />
        <aside className="space-y-5">
          <div className="rounded-card border border-line bg-surface p-5">
            <Icon name="sparkles" className="text-gold" />
            <h2 className="display mt-4 text-lg">Una búsqueda con intención</h2>
            <ol className="mt-5 space-y-5">
              {[
                ["Encuentra", "Negocios que encajan con tu oferta."],
                ["Entiende", "Señales concretas y evidencia de su web."],
                ["Conecta", "Un ángulo relevante para iniciar una conversación."],
              ].map(([title, text], i) => (
                <li key={title} className="flex gap-3">
                  <span className="tnum mt-0.5 text-[10px] text-gold">0{i + 1}</span>
                  <div>
                    <p className="text-[13px] font-medium">{title}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-dim">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <section
            id="search-history"
            aria-labelledby="search-history-title"
            className="scroll-mt-24 rounded-card border border-line p-5"
          >
            <h2 id="search-history-title" className="eyebrow">
              Historial de búsquedas
            </h2>
            <p className="tnum mt-2 text-[11px] text-dim">
              {totalSearches} {totalSearches === 1 ? "búsqueda guardada" : "búsquedas guardadas"}
            </p>
            {searches?.length ? (
              <ul className="mt-3 divide-y divide-line">
                {searches.map((search) => (
                  <li key={search.id}>
                    <Link
                      href={`/buscar/${search.id}`}
                      aria-label={`Abrir búsqueda: ${search.niche}, ${search.city || "todo el país"}, ${new Date(search.created_at).toLocaleString("es")}`}
                      className="group block py-3"
                    >
                      <p className="text-[13px] text-muted group-hover:text-gold">{search.niche}</p>
                      <p className="mt-1 text-[10px] text-dim">
                        {search.city || "Todo el país"} ·{" "}
                        {search.mode === "demo" ? "Ejemplo" : "Conectada"} ·{" "}
                        {search.status === "done"
                          ? "Completada"
                          : search.status === "failed"
                            ? "Pendiente de revisión"
                            : "En proceso"}
                      </p>
                      <time
                        dateTime={search.created_at}
                        className="tnum mt-1 block text-[10px] text-dim"
                      >
                        {new Date(search.created_at).toLocaleDateString("es", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-[12px] leading-relaxed text-dim">
                Tus búsquedas se guardarán aquí automáticamente al iniciarlas.
              </p>
            )}
            {totalPages > 1 && (
              <nav aria-label="Paginación del historial" className="mt-4 border-t border-line pt-4">
                <p className="tnum mb-3 text-[11px] text-dim" aria-live="polite">
                  Página {page} de {totalPages}
                </p>
                <div className="flex flex-wrap justify-between gap-2">
                  {page > 1 ? (
                    <Link
                      href={`/buscar?page=${page - 1}#search-history`}
                      aria-label="Página anterior del historial"
                      className="pill"
                    >
                      ← Anterior
                    </Link>
                  ) : (
                    <span className="pill opacity-40" aria-disabled="true">
                      ← Anterior
                    </span>
                  )}
                  {page < totalPages ? (
                    <Link
                      href={`/buscar?page=${page + 1}#search-history`}
                      aria-label="Página siguiente del historial"
                      className="pill"
                    >
                      Siguiente →
                    </Link>
                  ) : (
                    <span className="pill opacity-40" aria-disabled="true">
                      Siguiente →
                    </span>
                  )}
                </div>
              </nav>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
