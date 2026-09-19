"use client";
import { updateDefaultLimits } from "./actions";
import { Button } from "@/components/ui";
import { ActionFeedback, useActionFeedback } from "@/components/action-feedback";
const FIELDS: [string, string][] = [
  ["searches_per_day", "Búsquedas por día"],
  ["ai_analyses_per_day", "Negocios analizados por día"],
  ["quality_generations_per_day", "Ángulos y mensajes por día"],
  ["enrichments_per_day", "Búsquedas de decisor por día"],
];
export function LimitsForm({ limits }: { limits: Record<string, number> }) {
  const { pending, error, success, run } = useActionFeedback();
  return (
    <form
      action={(fd) => run(() => updateDefaultLimits(fd), "Límites diarios actualizados.")}
      className="rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <div className="space-y-4">
        {FIELDS.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-muted">{label}</span>
            <input
              type="number"
              name={key}
              min={0}
              max={1000000}
              step={1}
              required
              defaultValue={limits[key] ?? 0}
              className="field tnum !w-24 !shrink-0 !p-2 text-right"
            />
          </label>
        ))}
      </div>
      <Button variant="ghost" type="submit" disabled={pending} className="mt-5">
        {pending ? "Guardando…" : "Guardar límites"}
      </Button>
      <ActionFeedback error={error} success={success} />
    </form>
  );
}
