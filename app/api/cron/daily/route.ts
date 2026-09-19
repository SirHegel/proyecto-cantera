import { admin } from "@/lib/quota";

/**
 * §37 — mantenimiento diario.
 *
 * Purga el contenido de Google vencido. No es opcional: los términos de Maps
 * Platform no permiten almacenarlo indefinidamente, así que esta tarea es parte
 * del cumplimiento, no una optimización.
 *
 * Vercel manda `Authorization: Bearer ${CRON_SECRET}` en cada invocación.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const esperado = process.env.CRON_SECRET;
  if (!esperado || req.headers.get("authorization") !== `Bearer ${esperado}`) {
    return new Response("No autorizado", { status: 401 });
  }

  const db = admin();
  const { data: purgados, error } = await db.rpc("purge_expired_places");

  if (error) {
    console.error("[cron] purga falló", error);
    return Response.json(
      { ok: false, error: "No se pudo completar el mantenimiento." },
      { status: 500 },
    );
  }

  // Los contadores diarios viejos no hacen daño, pero tampoco sirven: se
  // conservan 60 días para el panel de consumo y se tiran los anteriores.
  const corte = new Date();
  corte.setDate(corte.getDate() - 60);
  await db.from("usage_counters").delete().lt("day", corte.toISOString().slice(0, 10));

  return Response.json({ ok: true, purgados });
}
