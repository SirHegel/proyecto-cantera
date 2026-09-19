"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

/** §22 — el botón GUARDAR de cada resultado. Un booleano, no una copia de fila. */
export async function toggleSaved(leadId: string, saved: boolean): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Tu sesión caducó.");
  const { error } = await supabase
    .from("leads")
    .update({ saved })
    .eq("id", leadId)
    .eq("user_id", user.id);
  if (error) throw new Error("No pudimos guardar el cambio.");
  revalidatePath("/buscar", "layout");

  revalidatePath("/leads");
  revalidatePath("/");
}

/** Guardar en bloque: revisar 30 resultados uno por uno es fricción sin valor. */
export async function saveAll(searchId: string, soloRecomendados: boolean): Promise<void> {
  const supabase = await supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Tu sesión caducó.");
  let q = supabase
    .from("leads")
    .update({ saved: true })
    .eq("user_id", user.id)
    .eq("search_id", searchId)
    .eq("candidate", true)
    .eq("saved", false);

  if (soloRecomendados) q = q.eq("qualified", true);

  const { error } = await q;
  if (error) throw new Error("No pudimos guardar los resultados.");

  revalidatePath(`/buscar/${searchId}`);
  revalidatePath("/leads");
  revalidatePath("/");
}
