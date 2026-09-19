import { discover, type Progress } from "@/lib/pipeline/discover";
import { supabaseServer } from "@/lib/supabase/server";
import { isId } from "@/lib/validation";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Atomic database claim prevents two tabs from spending twice on one search. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isId(id)) return new Response("Búsqueda inválida", { status: 400 });
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const { data: search } = await db
    .from("searches")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!search) return new Response("No encontrada", { status: 404 });

  const stale = Date.now() - Date.parse(search.updated_at) > 6 * 60_000;
  let claimed = false;
  if (["pending", "failed"].includes(search.status) || (search.status !== "done" && stale)) {
    const { data, error } = await db
      .from("searches")
      .update({ status: "discovering", error: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", search.status)
      .eq("updated_at", search.updated_at)
      .select("id")
      .maybeSingle();
    if (error) return Response.json({ error: "No pudimos iniciar la búsqueda." }, { status: 500 });
    claimed = !!data;
  }
  const enc = new TextEncoder();
  let disconnected = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (progress: Progress) => {
        if (disconnected) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(progress)}\n\n`));
        } catch {
          disconnected = true;
        }
      };
      try {
        if (search.status === "done") send({ type: "done", searchId: id });
        else if (claimed) {
          for await (const progress of discover(search, new URL(req.url).origin)) send(progress);
        } else {
          send({
            type: "stage",
            message: "La búsqueda ya está en marcha. Recuperando su progreso…",
          });
          const until = Date.now() + 270_000;
          while (!disconnected && Date.now() < until) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const { data: current } = await db
              .from("searches")
              .select("status,error,updated_at")
              .eq("id", id)
              .maybeSingle();
            if (current?.status === "done") {
              send({ type: "done", searchId: id });
              return;
            }
            if (!current || current.status === "failed") {
              send({ type: "error", message: "La búsqueda se interrumpió. Puedes reintentarla." });
              return;
            }
          }
          send({
            type: "error",
            message: "La búsqueda sigue en curso. Vuelve a abrirla en un momento.",
          });
        }
      } catch (error) {
        console.error("[pipeline]", error instanceof Error ? error.message : "Error de búsqueda");
        if (claimed)
          await db
            .from("searches")
            .update({
              status: "failed",
              error:
                "La búsqueda se interrumpió. Revisa la configuración de los proveedores y reintenta.",
            })
            .eq("id", id);
        send({
          type: "error",
          message:
            "No pudimos completar la búsqueda. Revisa la configuración o inténtalo de nuevo.",
        });
      } finally {
        if (!disconnected) {
          try {
            controller.close();
          } catch {}
        }
      }
    },
    cancel() {
      disconnected = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
