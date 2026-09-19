"use server";

import { revalidatePath } from "next/cache";
import { admin } from "@/lib/quota";
import { supabaseServer } from "@/lib/supabase/server";

async function requiereAdmin(): Promise<string | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "admin" ? user.id : null;
}

const CLAVES = [
  "searches_per_day",
  "ai_analyses_per_day",
  "quality_generations_per_day",
  "enrichments_per_day",
] as const;

/** §35 — cambiar los límites por defecto de todos los alumnos. */
export async function updateDefaultLimits(formData: FormData): Promise<void> {
  if (!(await requiereAdmin())) return;

  const limits: Record<string, number> = {};
  for (const k of CLAVES) {
    const v = Number(formData.get(k));
    if (Number.isFinite(v) && v >= 0) limits[k] = Math.floor(v);
  }

  const { data: existing } = await admin()
    .from("app_settings")
    .select("default_limits")
    .eq("id", true)
    .single();
  const { error } = await admin()
    .from("app_settings")
    .update({
      default_limits: { ...existing?.default_limits, ...limits },
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) throw new Error("No pudimos guardar los límites.");
  revalidatePath("/admin");
}

/** Sin invitación no hay registro, y sin registro nadie gasta tu presupuesto. */
export async function inviteEmail(formData: FormData): Promise<void> {
  if (!(await requiereAdmin())) return;

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new Error("Introduce un correo válido.");

  await admin().from("invites").upsert({ email }, { onConflict: "email" });
  revalidatePath("/admin");
}

export async function revokeInvite(email: string): Promise<void> {
  if (!(await requiereAdmin())) return;
  await admin().from("invites").delete().eq("email", email).is("used_at", null);
  revalidatePath("/admin");
}
