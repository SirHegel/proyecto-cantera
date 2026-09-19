import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Button, Card, Eyebrow } from "@/components/ui";
import { Icon } from "@/components/icons";
import { isLocalMode } from "@/lib/runtime";
import { getProviderStatus } from "@/lib/settings";
import { OfferForm } from "./offer-form";
import { ProviderForm } from "./provider-form";
const LABELS: Record<string, string> = {
  searches_per_day: "Búsquedas",
  ai_analyses_per_day: "Negocios analizados",
  quality_generations_per_day: "Ángulos y mensajes",
  enrichments_per_day: "Búsquedas de decisor",
};
export default async function ConfiguracionPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, { data: settings }, { data: counters }, { data: offer }, providers] =
    await Promise.all([
      supabase.from("profiles").select("email, full_name, role, limits").eq("id", user.id).single(),
      supabase.from("app_settings").select("default_limits").single(),
      supabase
        .from("usage_counters")
        .select("kind, used")
        .eq("user_id", user.id)
        .eq("day", new Date().toISOString().slice(0, 10)),
      supabase
        .from("offers")
        .select("what_i_sell, problem_solved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getProviderStatus(),
    ]);
  const limits = { ...(settings?.default_limits ?? {}), ...(profile?.limits ?? {}) } as Record<
    string,
    number
  >;
  const used = Object.fromEntries((counters ?? []).map((c) => [c.kind, c.used]));
  const localMode = isLocalMode();
  return (
    <>
      <Eyebrow>Un espacio a tu medida</Eyebrow>
      <h1 className="page-title">Configuración.</h1>
      <p className="mt-3 text-sm text-muted">
        Tu cuenta, tu oferta y las conexiones para encontrar nuevos clientes.
      </p>
      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <ProviderForm {...providers} />
          <Card>
            <div className="flex items-center gap-3">
              <Icon name="sparkles" className="text-gold" />
              <h2 className="display text-lg">Tu oferta</h2>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Describe el valor que aportas. Usamos esta información para identificar negocios que
              puedan necesitarte.
            </p>
            <OfferForm
              whatISell={offer?.what_i_sell ?? ""}
              problemSolved={offer?.problem_solved ?? ""}
            />
          </Card>
        </div>
        <aside className="space-y-6">
          <Card>
            <Eyebrow>Tu cuenta</Eyebrow>
            <p className="mt-4 text-sm font-medium">
              {profile?.full_name || (user?.email ?? "").split("@")[0]}
            </p>
            <p className="mt-1 text-[12px] text-muted">{profile?.email ?? user?.email}</p>
            <span className="status-pill mt-3">
              {profile?.role === "admin" ? "Administrador" : "Miembro"}
            </span>
            <p className="mt-4 text-[12px] leading-relaxed text-dim">
              {localMode
                ? "Tu cuenta y tus oportunidades se guardan en este equipo."
                : "Tu información se guarda en el espacio conectado de Cantera."}
            </p>
            <form action="/auth/signout" method="post" className="mt-5">
              <Button variant="ghost" type="submit" className="w-full">
                <Icon name="logout" width="16" height="16" />
                Cerrar sesión
              </Button>
            </form>
          </Card>
          <Card>
            <Eyebrow>Tu cuota de hoy</Eyebrow>
            <div className="mt-5 space-y-5">
              {Object.entries(LABELS).map(([key, label]) => {
                const total = limits[key] ?? 0;
                const consumed = used[key] ?? 0;
                const remaining = Math.max(total - consumed, 0);
                return (
                  <div key={key}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[12px] text-muted">{label}</p>
                      <p className="tnum shrink-0 text-[11px] text-ink">
                        {remaining} / {total}
                      </p>
                    </div>
                    <div
                      className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line"
                      role="meter"
                      aria-label={`${label}: disponibles`}
                      aria-valuenow={remaining}
                      aria-valuemin={0}
                      aria-valuemax={Math.max(total, 1)}
                    >
                      <div
                        className="h-full rounded-full bg-gold-dim"
                        style={{
                          width: total ? `${Math.min(100, (remaining / total) * 100)}%` : "0%",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-5 text-[11px] leading-relaxed text-dim">
              Disponibles de tu límite diario. Los contadores se renuevan cada día; las búsquedas de
              ejemplo no consumen búsquedas.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
