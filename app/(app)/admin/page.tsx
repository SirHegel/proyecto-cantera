import { redirect } from "next/navigation";
import { Eyebrow, Stat } from "@/components/ui";
import { isLocalMode } from "@/lib/runtime";
import { admin } from "@/lib/quota";
import { supabaseServer } from "@/lib/supabase/server";
import { InvitesPanel } from "./invites-panel";
import { LimitsForm } from "./limits-form";

const NOMBRES: Record<string, string> = {
  places_call: "Llamadas a Places",
  ai_bulk: "Análisis",
  ai_quality: "Ángulos y mensajes",
  enrichment: "Enriquecimientos",
};

function dinero(n: number) {
  return `$${n.toFixed(2)}`;
}

export default async function AdminPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: yo } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (yo?.role !== "admin") redirect("/");

  const db = admin();
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hace30 = new Date(hoy);
  hace30.setDate(hace30.getDate() - 30);

  const [
    { data: eventos },
    { data: perfiles },
    { data: settings },
    { data: busquedas },
    { data: gens },
    { data: invites },
  ] = await Promise.all([
    db
      .from("usage_events")
      .select("user_id, kind, units, cost_usd, created_at")
      .gte("created_at", hace30.toISOString()),
    db.from("profiles").select("id, email, role, limits"),
    db.from("app_settings").select("default_limits").single(),
    db
      .from("searches")
      .select("user_id, found_count, created_at")
      .gte("created_at", hace30.toISOString()),
    db
      .from("lead_generations")
      .select("input_tokens, output_tokens, created_at")
      .gte("created_at", hace30.toISOString()),
    db
      .from("invites")
      .select("email, used_at, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const ev = eventos ?? [];
  const evHoy = ev.filter((e) => new Date(e.created_at) >= hoy);
  const busq = busquedas ?? [];
  const busqHoy = busq.filter((b) => new Date(b.created_at) >= hoy);

  const suma = (lista: typeof ev, kind: string) =>
    lista.filter((e) => e.kind === kind).reduce((s, e) => s + e.units, 0);

  const gastoHoy = evHoy.reduce((s, e) => s + Number(e.cost_usd), 0);
  const gasto30 = ev.reduce((s, e) => s + Number(e.cost_usd), 0);

  const tokens = (gens ?? []).reduce(
    (s, g) => s + (g.input_tokens ?? 0) + (g.output_tokens ?? 0),
    0,
  );

  const activos = new Set(ev.map((e) => e.user_id)).size;

  const porUsuario = (perfiles ?? [])
    .map((p) => {
      const mios = ev.filter((e) => e.user_id === p.id);
      return {
        ...p,
        gasto: mios.reduce((s, e) => s + Number(e.cost_usd), 0),
        busquedas: busq.filter((b) => b.user_id === p.id).length,
        analisis: suma(mios, "ai_bulk"),
        calidad: suma(mios, "ai_quality"),
      };
    })
    .sort((a, b) => b.gasto - a.gasto);

  return (
    <>
      <Eyebrow>Administración del espacio</Eyebrow>
      <h1 className="page-title">
        {dinero(gastoHoy)} <span className="text-muted">hoy</span>
      </h1>
      <p className="mt-2 text-sm text-muted">
        {dinero(gasto30)} en los últimos 30 días · {activos} usuarios activos
      </p>

      <div className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["Búsquedas hoy", busqHoy.length],
          ["Negocios encontrados", busq.reduce((s, b) => s + (b.found_count ?? 0), 0)],
          ["Tokens (30 días)", tokens.toLocaleString("es")],
          ["Llamadas a Places hoy", suma(evHoy, "places_call")],
        ].map(([label, value]) => (
          <Stat key={String(label)} label={String(label)} value={value} />
        ))}
      </div>

      <section className="mt-12">
        <Eyebrow>Por tipo, últimos 30 días</Eyebrow>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {Object.entries(NOMBRES).map(([kind, label]) => {
            const unidades = suma(ev, kind);
            const coste = ev
              .filter((e) => e.kind === kind)
              .reduce((s, e) => s + Number(e.cost_usd), 0);
            return (
              <div key={kind} className="flex items-center justify-between py-3">
                <p className="text-sm">{label}</p>
                <p className="tnum text-[13px] text-muted">
                  {unidades} · {dinero(coste)}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <Eyebrow>Por usuario, últimos 30 días</Eyebrow>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {porUsuario.map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_auto] gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm">{p.email}</p>
                <p className="text-[12px] text-dim">
                  {p.busquedas} búsquedas · {p.analisis} análisis · {p.calidad} generaciones
                  {p.role === "admin" && " · admin"}
                </p>
              </div>
              <p className={`tnum text-sm ${p.gasto > 15 ? "text-gold" : "text-muted"}`}>
                {dinero(p.gasto)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <Eyebrow>Límites diarios</Eyebrow>
        <p className="mt-2 max-w-xl text-[13px] text-muted">
          Define las cuotas de uso por persona. Los límites de facturación de Google Places y OpenAI
          se administran también desde la cuenta de cada proveedor.
        </p>
        <div className="mt-4">
          <LimitsForm limits={(settings?.default_limits ?? {}) as Record<string, number>} />
        </div>
      </section>

      <section className="mt-12">
        <Eyebrow>Acceso</Eyebrow>
        <p className="mt-2 max-w-xl text-[13px] text-muted">
          {isLocalMode()
            ? "Las personas pueden crear su propia cuenta en este equipo desde la pantalla de registro."
            : "Autoriza los correos que pueden crear una cuenta en este espacio."}
        </p>
        <div className="mt-4">{!isLocalMode() && <InvitesPanel invites={invites ?? []} />}</div>
      </section>
    </>
  );
}
