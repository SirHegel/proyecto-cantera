import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { EmptyState, Eyebrow, LinkButton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { FollowupButton } from "./followup-button";

export default async function SeguimientosPage() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, business_name, public_email, public_phone, followup_count, next_followup_at, status",
    )
    .eq("saved", true)
    .not("next_followup_at", "is", null)
    .order("next_followup_at");
  if (error) throw new Error("No pudimos cargar los seguimientos.");
  const rows = (data ?? []).filter((r) => !["cerrado", "descartado"].includes(r.status));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const groups = [
    {
      title: "Pendientes anteriores",
      description: "Estas conversaciones necesitan un nuevo paso.",
      items: rows.filter((r) => new Date(r.next_followup_at!) < start),
      accent: true,
    },
    {
      title: "Para hoy",
      description: "Tu agenda de conversaciones de hoy.",
      items: rows.filter((r) => {
        const d = new Date(r.next_followup_at!);
        return d >= start && d < end;
      }),
      accent: true,
    },
    {
      title: "Próximos días",
      description: "Todo preparado para continuar a tiempo.",
      items: rows.filter((r) => new Date(r.next_followup_at!) >= end),
      accent: false,
    },
  ];
  return (
    <>
      <div className="page-header">
        <div>
          <Eyebrow>La constancia abre conversaciones</Eyebrow>
          <h1 className="page-title">Ninguna oportunidad en el olvido.</h1>
          <p className="mt-3 text-sm text-muted">
            Organiza tus próximos contactos y registra cada seguimiento.
          </p>
        </div>
        <LinkButton href="/leads" variant="ghost">
          Ver mis leads <Icon name="arrow" width="16" height="16" />
        </LinkButton>
      </div>
      <div className="mt-7 grid grid-cols-3 gap-3">
        {groups.map((g) => (
          <div key={g.title} className="rounded-card border border-line bg-surface p-4 sm:p-5">
            <p className="text-[11px] text-muted">{g.title}</p>
            <p
              className={`tnum display mt-3 text-3xl ${g.accent && g.items.length ? "text-gold" : ""}`}
            >
              {g.items.length}
            </p>
          </div>
        ))}
      </div>
      {!rows.length ? (
        <div className="mt-6">
          <EmptyState
            title="Tu agenda está al día."
            body="Al marcar un lead como contactado, Cantera programa el primer seguimiento. También puedes elegir una fecha desde su ficha."
            action={
              <LinkButton href="/leads" variant="ghost">
                Abrir mis leads
              </LinkButton>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.title}>
                <div className="mb-4 flex items-center gap-3">
                  <Icon
                    name="calendar"
                    className={g.accent ? "text-gold" : "text-dim"}
                    width="18"
                    height="18"
                  />
                  <div>
                    <h2 className="display text-lg">{g.title}</h2>
                    <p className="mt-1 text-[12px] text-dim">{g.description}</p>
                  </div>
                </div>
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {g.items.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
                      <Link
                        href={`/leads/${r.id}`}
                        className="min-w-0 basis-full hover:text-gold sm:flex-1 sm:basis-0"
                      >
                        <p className="text-sm font-medium">{r.business_name}</p>
                        <p className="mt-1.5 text-[12px] text-dim">
                          {r.public_email ?? r.public_phone ?? "Sin contacto público"} · Seguimiento{" "}
                          {r.followup_count + 1}
                        </p>
                      </Link>
                      <p
                        className={`tnum mr-auto text-[12px] sm:mr-2 ${g.accent ? "text-gold" : "text-dim"}`}
                      >
                        {new Date(r.next_followup_at!).toLocaleDateString("es", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <FollowupButton leadId={r.id} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
      <p className="mt-6 text-[11px] leading-relaxed text-dim">
        Cantera organiza tus recordatorios. Los mensajes los revisas y envías tú.
      </p>
    </>
  );
}
