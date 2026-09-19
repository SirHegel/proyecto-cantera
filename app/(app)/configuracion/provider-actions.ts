"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { storeProviderSettings } from "@/lib/settings";
export async function saveProviderSettings(formData: FormData): Promise<void> {
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Inicia sesión para configurar los proveedores.");
  await storeProviderSettings(
    user.id,
    String(formData.get("mode") ?? "fixture"),
    String(formData.get("google_places_api_key") ?? ""),
    String(formData.get("openai_api_key") ?? ""),
  );
  revalidatePath("/configuracion");
  revalidatePath("/buscar");
}
