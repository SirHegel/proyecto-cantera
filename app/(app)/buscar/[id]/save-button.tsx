"use client";
import { useOptimistic } from "react";
import { toggleSaved } from "./actions";
import { ActionFeedback, useActionFeedback } from "@/components/action-feedback";
export function SaveButton({ leadId, saved }: { leadId: string; saved: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const { pending, error, run } = useActionFeedback();
  return (
    <div>
      <button
        disabled={pending}
        aria-pressed={optimistic}
        onClick={() =>
          run(async () => {
            setOptimistic(!saved);
            await toggleSaved(leadId, !saved);
          })
        }
        className="pill"
      >
        {pending ? "Guardando…" : optimistic ? "Guardado ✓" : "Guardar"}
      </button>
      <ActionFeedback error={error} />
    </div>
  );
}
