"use client";
import { saveAll } from "./actions";
import { ActionFeedback, useActionFeedback } from "@/components/action-feedback";
export function SaveAllButton({
  searchId,
  recomendados,
  candidatos,
}: {
  searchId: string;
  recomendados: number;
  candidatos: number;
}) {
  const { pending, error, success, run } = useActionFeedback();
  return (
    <div>
      {candidatos > 0 && (
        <div className="flex flex-wrap gap-2">
          {recomendados > 0 && (
            <button
              disabled={pending}
              onClick={() =>
                run(() => saveAll(searchId, true), "Oportunidades guardadas en Mis leads.")
              }
              className="pill border-gold/50 text-gold"
            >
              {pending ? "Guardando…" : `Guardar ${recomendados} recomendados`}
            </button>
          )}
          <button
            disabled={pending}
            onClick={() => run(() => saveAll(searchId, false), "Negocios guardados en Mis leads.")}
            className="pill"
          >
            {pending ? "Guardando…" : `Guardar todos (${candidatos})`}
          </button>
        </div>
      )}
      <ActionFeedback error={error} success={success} />
    </div>
  );
}
