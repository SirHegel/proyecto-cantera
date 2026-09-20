"use server";

import { revalidatePath } from "next/cache";
import { DIAS_SIGUIENTE, ESTADOS, type Estado } from "@/lib/crm";
import { supabaseServer } from "@/lib/supabase/server";
import { followupDate, isId } from "@/lib/validation";

function enDias(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
}

async function ownedLead(leadId: string) {
  if (!isId(leadId)) throw new Error("Negocio inválido.");
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Tu sesión caducó. Vuelve a entrar.");
  const { data: lead, error } = await db
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !lead) throw new Error("No encontramos ese negocio.");
  return { db, user, lead };
}

function refresh(leadId: string) {
  for (const path of [`/leads/${leadId}`, "/leads", "/seguimientos", "/", "/buscar"])
    revalidatePath(path);
}

async function registrar(leadId: string, userId: string, type: string, body: string, meta = {}) {
  const db = await supabaseServer();
  const { error } = await db
    .from("activities")
    .insert({ lead_id: leadId, user_id: userId, type, body, meta });
  if (error) throw new Error("No pudimos guardar la actividad.");
}

export async function setStatus(leadId: string, estado: Estado): Promise<void> {
  if (!Object.hasOwn(ESTADOS, estado)) throw new Error("Estado no válido.");
  const { db, user, lead } = await ownedLead(leadId);
  if (lead.status === estado) return;
  const patch: Record<string, unknown> = { status: estado, saved: true };
  if (estado === "contactado") {
    patch.next_followup_at = enDias(DIAS_SIGUIENTE[0]!);
    patch.followup_count = 0;
  }
  if (estado === "nuevo" || estado === "listo") {
    patch.next_followup_at = null;
    patch.followup_count = 0;
  }
  if (["respondio", "demo", "conversacion", "cerrado", "descartado"].includes(estado))
    patch.next_followup_at = null;
  const { error } = await db.from("leads").update(patch).eq("id", leadId).eq("user_id", user.id);
  if (error) throw new Error("No pudimos cambiar el estado.");
  await registrar(
    leadId,
    user.id,
    estado === "contactado" ? "contacted" : "status_change",
    ESTADOS[estado],
  );
  refresh(leadId);
}

export async function logFollowup(leadId: string): Promise<void> {
  const { db, user, lead } = await ownedLead(leadId);
  if (!lead.next_followup_at || ["cerrado", "descartado"].includes(lead.status)) return;
  const previous = lead.followup_count ?? 0;
  const hechos = previous + 1;
  const dias = DIAS_SIGUIENTE[hechos] ?? null;
  const { data, error } = await db
    .from("leads")
    .update({
      followup_count: hechos,
      next_followup_at: dias === null ? null : enDias(dias),
    })
    .eq("id", leadId)
    .eq("user_id", user.id)
    .eq("followup_count", previous)
    .select("id");
  if (error) throw new Error("No pudimos registrar el seguimiento.");
  if (!data?.length) return;
  await registrar(leadId, user.id, "followup_scheduled", `Seguimiento ${hechos}`, { hechos });
  refresh(leadId);
}

export async function scheduleFollowup(leadId: string, fecha: string): Promise<void> {
  const parsed = followupDate(fecha);
  if (!parsed) throw new Error("Elige una fecha válida.");
  const { db, user, lead } = await ownedLead(leadId);
  if (["cerrado", "descartado"].includes(lead.status))
    throw new Error("Reactiva este lead antes de programar un seguimiento.");
  const { error } = await db
    .from("leads")
    .update({ next_followup_at: parsed, saved: true })
    .eq("id", leadId)
    .eq("user_id", user.id);
  if (error) throw new Error("No pudimos programar el seguimiento.");
  await registrar(leadId, user.id, "followup_scheduled", fecha);
  refresh(leadId);
}

export async function addNote(leadId: string, body: string): Promise<void> {
  if (typeof body !== "string" || !body.trim() || body.length > 5000)
    throw new Error("La nota debe tener entre 1 y 5000 caracteres.");
  const { user } = await ownedLead(leadId);
  await registrar(leadId, user.id, "note", body.trim());
  refresh(leadId);
}
