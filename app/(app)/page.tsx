import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, Eyebrow, LinkButton } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import type { Estado } from "@/lib/crm";
import { supabaseServer } from "@/lib/supabase/server";
import { isLocalMode } from "@/lib/runtime";

const ETAPAS: { label: string; estados: Estado[] }[] = [
  {
    label: "Guardados",
    estados: ["nuevo", "listo", "contactado", "respondio", "demo", "conversacion", "cerrado"],
  },
  { label: "Contactados", estados: ["contactado", "respondio", "demo", "conversacion", "cerrado"] },
  { label: "Respondieron", estados: ["respondio", "demo", "conversacion", "cerrado"] },
  { label: "Demos", estados: ["demo", "conversacion", "cerrado"] },
  { label: "Cierres", estados: ["cerrado"] },
];
export default async function HomePage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: guardados, error: leadsError }, { data: sinRevisar }, { data: ultimaBusqueda }] =
    await Promise.all([
      supabase
        .from("leads")
        .select("status, qualified, next_followup_at")
        .eq("user_id", user.id)
        .eq("saved", true),
      supabase
        .from("leads")
        .select("id, search_id")
        .eq("user_id", user.id)
        .eq("saved", false)
        .eq("candidate", true)
        .eq("qualified", true)
        .neq("status", "descartado")
        .limit(200),
      supabase
        .from("searches")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (leadsError) throw new Error("No pudimos cargar tus oportunidades.");
  const rows = guardados ?? [];
  const cuenta = (estados: Estado[]) =>
    rows.filter((l) => estados.includes(l.status as Estado)).length;
  const embudo = ETAPAS.map((e) => ({ ...e, n: cuenta(e.estados) }));
  const base = embudo[0].n || 1;
  const porRevisar = (sinRevisar ?? []).length;
  const listos = cuenta(["listo"]);
  const activas = cuenta(["respondio", "demo", "conversacion"]);
  const finDeHoy = new Date();
  finDeHoy.setHours(24, 0, 0, 0);
  const seguimientosHoy = rows.filter(
    (l) =>
      l.next_followup_at &&
      new Date(l.next_followup_at) < finDeHoy &&
      !["cerrado", "descartado"].includes(l.status),
  ).length;
  const localMode = isLocalMode();
  const nombre = (user?.email ?? "").split("@")[0];
  const arranque = rows.length === 0 && porRevisar === 0;
  const paraHoy: { titulo: string; texto: string; href: string; n: number; icon: IconName }[] = [
    {
      titulo: "Revisar oportunidades",
      texto: "Encuentra los negocios que mejor encajan.",
      href: sinRevisar?.[0]?.search_id
        ? `/buscar/${sinRevisar[0].search_id}`
        : ultimaBusqueda
          ? `/buscar/${ultimaBusqueda.id}`
          : "/buscar",
      n: porRevisar,
      icon: "search",
    },
    {
      titulo: "Iniciar conversaciones",
      texto: "Tienes un mensaje y un motivo para escribir.",
      href: "/leads?g=listo",
      n: listos,
      icon: "mail",
    },
    {
      titulo: "Hacer seguimiento",
      texto: "Retoma las conversaciones que siguen abiertas.",
      href: "/seguimientos",
      n: seguimientosHoy,
      icon: "calendar",
    },
  ];
  return (
    <>
      <div className="page-header">
        <div>
          <Eyebrow>Tu negocio, en movimiento</Eyebrow>
          <h1 className="page-title">
            Cada oportunidad cuenta<span className="text-gold">.</span>
          </h1>
          <p className="mt-3 text-sm text-muted">
            Hola{nombre ? `, ${nombre}` : ""}. Este es el pulso de tu prospección.
          </p>
        </div>
        <LinkButton href="/buscar">
          <Icon name="plus" width="17" height="17" />
          Nueva búsqueda
        </LinkButton>
      </div>
      {localMode && (
        <div className="notice mt-7 flex items-start gap-3">
          <Icon name="globe" className="mt-0.5 shrink-0 text-gold" width="17" height="17" />
          <p>
            <strong className="font-medium text-ink">Explora Cantera a tu ritmo.</strong> Tu trabajo
            se guarda en este equipo. Empieza con datos de ejemplo o conecta Google Places y OpenAI
            en Configuración para buscar negocios reales.
          </p>
        </div>
      )}
      <div className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "Leads guardados",
            n: rows.length,
            icon: "leads" as const,
            hint: "Tu cartera de oportunidades",
            href: "/leads?g=todos",
          },
          {
            label: "Por contactar",
            n: listos,
            icon: "mail" as const,
            hint: "Listos para dar el primer paso",
            href: "/leads?g=listo",
          },
          {
            label: "En conversación",
            n: activas,
            icon: "chart" as const,
            hint: "Relaciones que avanzan",
            href: "/leads?g=vivos",
          },
          {
            label: "Seguimientos de hoy",
            n: seguimientosHoy,
            icon: "calendar" as const,
            hint: "Incluye los pendientes anteriores",
            href: "/seguimientos",
          },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="group rounded-card border border-line bg-surface p-4 transition-colors hover:border-line-lit sm:p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] text-muted">{s.label}</p>
              <Icon name={s.icon} width="17" height="17" className="hidden text-dim sm:block" />
            </div>
            <p className="tnum display mt-5 text-4xl group-hover:text-gold">{s.n}</p>
            <p className="mt-3 text-[10px] leading-relaxed text-dim">{s.hint}</p>
          </Link>
        ))}
      </div>
      {arranque && (
        <div className="relative mt-6 overflow-hidden rounded-card border border-gold/25 bg-gold/5 p-6 sm:p-8">
          <div className="max-w-lg">
            <span className="eyebrow text-gold">Tu primera oportunidad está a una búsqueda</span>
            <h2 className="display mt-3 text-2xl">Menos listas. Más motivos para conectar.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Cuéntanos qué vendes. Cantera encuentra negocios, revisa las señales de oportunidad y
              te ayuda a preparar una conversación con contexto.
            </p>
            <Link
              href="/buscar"
              className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gold"
            >
              Empezar mi primera búsqueda <Icon name="arrow" width="16" height="16" />
            </Link>
          </div>
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <Eyebrow>De oportunidad a cliente</Eyebrow>
              <h2 className="display mt-2 text-xl">Tu embudo comercial</h2>
            </div>
            <Icon name="chart" className="text-dim" />
          </div>
          <div className="mt-7 space-y-6">
            {embudo.map((e, i) => (
              <div key={e.label}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-[13px] text-muted">
                    <span className="tnum w-5 text-[10px] text-dim">0{i + 1}</span>
                    {e.label}
                  </p>
                  <span className="tnum text-sm">{e.n}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(e.n / base) * 100}%`,
                      background:
                        i === 4 ? "var(--color-gold)" : `rgba(232, 199, 107, ${0.85 - i * 0.13})`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 border-t border-line pt-4 text-[11px] leading-relaxed text-dim">
            Cada etapa incluye los leads que ya avanzaron a la siguiente.
          </p>
        </Card>
        <Card>
          <Eyebrow>Un paso a la vez</Eyebrow>
          <h2 className="display mt-2 text-xl">Enfócate en lo que sigue</h2>
          <div className="mt-5 space-y-2">
            {paraHoy.map((c) => (
              <Link
                key={c.titulo}
                href={c.href}
                className="group flex items-start gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-line hover:bg-raised"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-gold">
                  <Icon name={c.icon} width="18" height="18" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{c.titulo}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-dim">{c.texto}</p>
                  <p className="tnum mt-2 text-[11px] text-gold">{c.n} pendientes</p>
                </div>
                <Icon
                  name="arrow"
                  className="mt-2 text-dim group-hover:text-gold"
                  width="15"
                  height="15"
                />
              </Link>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[12px] leading-relaxed text-muted">
              Una observación concreta vale más que cien mensajes iguales.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
