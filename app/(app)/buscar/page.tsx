import Link from "next/link";
import { SearchWizard } from "@/components/search-wizard";
import { Icon } from "@/components/icons";
import { Eyebrow } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase/server";
import { isLocalMode } from "@/lib/runtime";
import { getProviderStatus } from "@/lib/settings";

export default async function BuscarPage() {
  const supabase = await supabaseServer();
  const providers = await getProviderStatus();
  const [{ data: offer }, { data: searches }] = await Promise.all([
    supabase
      .from("offers")
      .select("what_i_sell, problem_solved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("searches")
      .select("id, niche, city, status, mode, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
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
          {!!searches?.length && (
            <div className="rounded-card border border-line p-5">
              <Eyebrow>Búsquedas recientes</Eyebrow>
              <div className="mt-3 divide-y divide-line">
                {searches.map((search) => (
                  <Link href={`/buscar/${search.id}`} key={search.id} className="group block py-3">
                    <p className="text-[13px] text-muted group-hover:text-gold">{search.niche}</p>
                    <p className="mt-1 text-[10px] text-dim">
                      {search.city || "Todo el país"} ·{" "}
                      {search.mode === "demo" ? "Ejemplo" : "Conectada"} ·{" "}
                      {search.status === "done"
                        ? "Completada"
                        : search.status === "error"
                          ? "Pendiente de revisión"
                          : "En proceso"}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
