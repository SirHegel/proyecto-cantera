/**
 * Vocabulario y reglas del CRM.
 *
 * Vive fuera de status-actions.ts porque un archivo "use server" solo puede
 * exportar funciones asíncronas: un objeto de constantes ahí rompe el build.
 */

export const ESTADOS = {
  nuevo: "Sin contactar",
  listo: "Listo para contactar",
  contactado: "Contactado",
  respondio: "Respondió",
  demo: "Demo enviada",
  conversacion: "En conversación",
  cerrado: "Cerrado",
  descartado: "Descartado",
} as const;

export type Estado = keyof typeof ESTADOS;

/**
 * §32 — la cadencia de seguimiento.
 *
 * Primero a los 3 días, segundo a los 6. Después nada: dos seguimientos sin
 * respuesta son una respuesta. Insistir una tercera vez no consigue clientes,
 * consigue bloqueos — y el alumno que aprende a insistir aquí lo va a hacer
 * en todas partes.
 */
export const DIAS_SIGUIENTE: Record<number, number | null> = { 0: 3, 1: 6, 2: null };

export function quedanSeguimientos(hechos: number): boolean {
  return typeof DIAS_SIGUIENTE[hechos] === "number";
}
