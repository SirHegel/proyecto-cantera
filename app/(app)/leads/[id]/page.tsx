import Link from "next/link";
import { notFound } from "next/navigation";
import { ScoreSeam } from "@/components/score-seam";
import { Card, Eyebrow } from "@/components/ui";
import { Icon } from "@/components/icons";
import { supabaseServer } from "@/lib/supabase/server";
import { AnglePanel, type Angle } from "./angle-panel";
import { MessagePanel, type Destinos, type Mensaje } from "./message-panel";
import { LeadActions } from "./lead-actions";
import { SaveButton } from "../../buscar/[id]/save-button";
import { ESTADOS, type Estado } from "@/lib/crm";
type Evidencia = { claim: string; quote: string; sourceUrl: string | null };
function safeUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id, business_name, city, country, website_url, website_domain, public_email, public_phone, has_form, has_booking_link, has_whatsapp, main_cta, social_links, web_status, score, score_breakdown, qualified, observed_problem, evidence, reason, confidence, status, saved, candidate, discard_reason, place_id, next_followup_at, followup_count",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("No pudimos cargar la oportunidad.");
  if (!lead) notFound();
  const [{ data: place }, { data: gen }, { data: messages }, { data: activities }] =
    await Promise.all([
      supabase
        .from("places_cache")
        .select("rating, user_rating_count, primary_type, google_maps_uri")
        .eq("place_id", lead.place_id)
        .maybeSingle(),
      supabase
        .from("lead_generations")
        .select("content")
        .eq("lead_id", lead.id)
        .eq("kind", "angle")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("lead_generations")
        .select("channel, content, created_at")
        .eq("lead_id", id)
        .eq("kind", "message")
        .order("created_at", { ascending: false }),
      supabase
        .from("activities")
        .select("type, body, created_at")
        .eq("lead_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
  const byChannel: Record<string, Mensaje> = {};
  for (const message of messages ?? [])
    if (message.channel && !byChannel[message.channel])
      byChannel[message.channel] = message.content as Mensaje;
  const socials = (lead.social_links ?? {}) as Record<string, string>;
  const destinations: Destinos = {
    email: lead.public_email,
    instagram: socials.instagram ?? null,
    linkedin: socials.linkedin ?? null,
  };
  const evidence = (lead.evidence ?? []) as Evidencia[];
  const analyzed = lead.score > 0 || evidence.length > 0;
  const findings: [boolean, string][] = [
    [!!place?.rating, `${place?.rating} de valoración · ${place?.user_rating_count ?? 0} reseñas`],
    [lead.web_status === "ok", "Sitio web activo"],
    [!!lead.public_phone, "Teléfono de contacto público"],
    [!!lead.public_email, "Correo de contacto público"],
    [lead.has_form, "Formulario de contacto"],
    [lead.has_whatsapp, "WhatsApp disponible"],
    [lead.has_booking_link, "Enlace de reserva visible"],
  ];
  const missing: [boolean, string][] = [
    [lead.web_status === "ok" && !lead.has_booking_link, "No encontramos reserva online visible"],
    [lead.web_status === "unreachable", "No pudimos leer su sitio web"],
    [!lead.website_url, "Sin sitio web registrado"],
    [lead.web_status === "ok" && !lead.public_email, "No encontramos email público"],
  ];
  const blocked = !analyzed
    ? lead.candidate
      ? "El análisis de este negocio no se completó. Puedes retomarlo en una nueva búsqueda cuando tengas cuota disponible."
      : `Este negocio se descartó antes del análisis: ${lead.discard_reason || "no encaja con la búsqueda"}.`
    : !evidence.length
      ? "No encontramos evidencia citable en su web para preparar un ángulo de contacto. Revisa el negocio antes de escribirle."
      : null;
  const website = safeUrl(lead.website_url);
  const maps = safeUrl(place?.google_maps_uri);
  return (
    <>
      <Link
        href="/leads"
        className="inline-flex min-h-10 items-center text-[12px] text-muted hover:text-gold"
      >
        ← Volver a mis leads
      </Link>
      <div className="page-header mt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>Ficha de oportunidad</Eyebrow>
            <span className="status-pill">{ESTADOS[lead.status as Estado] ?? lead.status}</span>
          </div>
          <h1 className="page-title">{lead.business_name}</h1>
          <p className="mt-3 text-[13px] text-muted">
            {[lead.city, lead.country, lead.website_domain].filter(Boolean).join(" · ")}
          </p>
        </div>
        <SaveButton leadId={lead.id} saved={lead.saved} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {website && (
          <a href={website} target="_blank" rel="noopener noreferrer" className="pill">
            <Icon name="globe" width="15" height="15" />
            Visitar web ↗
          </a>
        )}
        {lead.public_email && (
          <a href={`mailto:${encodeURIComponent(lead.public_email)}`} className="pill">
            <Icon name="mail" width="15" height="15" />
            Enviar correo
          </a>
        )}
        {lead.public_phone && (
          <a href={`tel:${lead.public_phone.replace(/[^\d+]/g, "")}`} className="pill">
            <Icon name="phone" width="15" height="15" />
            {lead.public_phone}
          </a>
        )}
        {maps && (
          <a href={maps} target="_blank" rel="noopener noreferrer" className="pill">
            Ver en Maps ↗
          </a>
        )}
      </div>
      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <Eyebrow>Encaje con tu oferta</Eyebrow>
                <h2 className="display mt-2 text-xl">
                  {lead.qualified
                    ? "Una oportunidad para explorar"
                    : "Conoce el contexto del negocio"}
                </h2>
              </div>
              {analyzed && (
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`tnum display text-4xl ${lead.qualified ? "text-gold" : "text-ink"}`}
                  >
                    {lead.score}
                  </span>
                  <span className="text-[12px] text-dim">/ 100</span>
                </div>
              )}
            </div>
            {analyzed && (
              <div className="mt-5">
                <ScoreSeam
                  breakdown={lead.score_breakdown ?? {}}
                  qualified={lead.qualified}
                  showLegend
                  height={7}
                />
              </div>
            )}
            {lead.reason && (
              <p className="mt-5 text-[13px] leading-relaxed text-muted">{lead.reason}</p>
            )}
            {lead.observed_problem && (
              <div className="mt-5 rounded-xl border border-gold/20 bg-gold/5 p-4">
                <Eyebrow>Posible oportunidad</Eyebrow>
                <p className="mt-2 text-[13px] leading-relaxed">{lead.observed_problem}</p>
                <p className="mt-3 text-[11px] leading-relaxed text-dim">
                  Interpretación a partir de las señales observadas; no es una declaración del
                  negocio.
                </p>
              </div>
            )}
          </Card>
          <Card>
            <Eyebrow>Datos para decidir</Eyebrow>
            <h2 className="display mt-2 text-xl">Lo que encontramos</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {findings
                .filter(([found]) => found)
                .map(([, text]) => (
                  <li key={text} className="flex gap-2 text-[12px] leading-relaxed">
                    <Icon
                      name="check"
                      width="15"
                      height="15"
                      className="mt-0.5 shrink-0 text-[#bed1a9]"
                    />
                    {text}
                  </li>
                ))}
              {missing
                .filter(([found]) => found)
                .map(([, text]) => (
                  <li key={text} className="flex gap-2 text-[12px] leading-relaxed text-muted">
                    <span className="text-dim">—</span>
                    {text}
                  </li>
                ))}
            </ul>
            {!!evidence.length && (
              <div className="mt-6 border-t border-line pt-5">
                <Eyebrow>Evidencia del sitio web</Eyebrow>
                <div className="mt-4 space-y-5">
                  {evidence.map((item, index) => (
                    <figure key={index} className="border-l-2 border-gold/35 pl-4">
                      <blockquote className="text-[13px] leading-relaxed">
                        “{item.quote}”
                      </blockquote>
                      <figcaption className="mt-2 text-[11px] leading-relaxed text-dim">
                        {item.claim}
                        {safeUrl(item.sourceUrl) && (
                          <>
                            {" "}
                            ·{" "}
                            <a
                              href={safeUrl(item.sourceUrl)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted underline underline-offset-2 hover:text-gold"
                            >
                              Ver origen ↗
                            </a>
                          </>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <Card>
            <Eyebrow>01 · Un motivo para escribir</Eyebrow>
            <h2 className="display mt-2 text-xl">Tu ángulo de contacto</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Una observación concreta y una idea útil para este negocio.
            </p>
            <div className="mt-5">
              <AnglePanel
                leadId={lead.id}
                angle={(gen?.content as Angle) ?? null}
                bloqueado={blocked}
              />
            </div>
          </Card>
          <Card>
            <Eyebrow>02 · Abre la conversación</Eyebrow>
            <h2 className="display mt-2 text-xl">El primer mensaje</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Personaliza el primer contacto y pide permiso para mostrar tu idea.
            </p>
            <div className="mt-5">
              <MessagePanel
                leadId={lead.id}
                negocio={lead.business_name}
                existentes={byChannel}
                destinos={destinations}
                disponible={!!gen}
              />
            </div>
          </Card>
        </div>
        <aside className="min-w-0 space-y-6">
          <Card>
            <Eyebrow>Tu siguiente paso</Eyebrow>
            <h2 className="display mt-2 text-xl">Organiza la conversación</h2>
            <div className="mt-6">
              <LeadActions
                leadId={lead.id}
                estado={lead.status as Estado}
                seguimiento={lead.next_followup_at}
                seguimientosHechos={lead.followup_count ?? 0}
              />
            </div>
          </Card>
          <Card>
            <Eyebrow>Historial de la oportunidad</Eyebrow>
            {activities?.length ? (
              <ol className="mt-5 space-y-5">
                {activities.map((activity, index) => (
                  <li key={index} className="border-l border-line pl-3">
                    <p className="tnum text-[10px] text-dim">
                      {new Date(activity.created_at).toLocaleDateString("es", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <p
                      className={`mt-1.5 whitespace-pre-line text-[12px] leading-relaxed ${activity.type === "note" ? "text-ink" : "text-muted"}`}
                    >
                      {activity.body}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-[12px] leading-relaxed text-dim">
                Aquí quedarán tus notas, cambios de estado y seguimientos.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
