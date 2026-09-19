import { supabaseServer } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { ESTADOS, type Estado } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const rows: unknown[][] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("leads")
      .select(
        "id,business_name,city,country,public_email,public_phone,website_url,score,status,next_followup_at,is_demo",
      )
      .eq("user_id", user.id)
      .eq("saved", true)
      .order("id")
      .range(offset, offset + 499);
    if (error) return Response.json({ error: "No pudimos exportar los leads." }, { status: 500 });
    for (const lead of data ?? [])
      rows.push([
        lead.business_name,
        lead.city,
        lead.country,
        lead.public_email,
        lead.public_phone,
        lead.website_url,
        lead.score,
        ESTADOS[lead.status as Estado] ?? lead.status,
        lead.next_followup_at,
        lead.is_demo ? "Sí" : "No",
      ]);
    if ((data?.length ?? 0) < 500) break;
  }
  return new Response(
    toCsv(
      [
        "Negocio",
        "Ciudad",
        "País",
        "Correo",
        "Teléfono",
        "Sitio web",
        "Puntuación",
        "Estado",
        "Próximo seguimiento",
        "Demostración",
      ],
      rows,
    ),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cantera-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
