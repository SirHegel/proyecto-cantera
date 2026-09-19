"use client";
import { saveOffer } from "@/app/(app)/buscar/actions";
import { Button } from "@/components/ui";
import { ActionFeedback, useActionFeedback } from "@/components/action-feedback";
export function OfferForm({
  whatISell,
  problemSolved,
}: {
  whatISell: string;
  problemSolved: string;
}) {
  const { pending, error, success, run } = useActionFeedback();
  return (
    <form
      action={(data) =>
        run(() => saveOffer(data), "Oferta guardada. La usaremos en tu próxima búsqueda.")
      }
      className="mt-5 space-y-4"
    >
      <div>
        <label htmlFor="saved-offer" className="field-label">
          ¿Qué vendes?
        </label>
        <textarea
          id="saved-offer"
          name="what_i_sell"
          rows={3}
          required
          minLength={10}
          maxLength={3000}
          defaultValue={whatISell}
          placeholder="Instalo recepcionistas con IA para clínicas dentales."
          className="field"
        />
      </div>
      <div>
        <label htmlFor="saved-problem" className="field-label">
          ¿Qué problema solucionas? <span className="text-[11px] text-dim">Opcional</span>
        </label>
        <textarea
          id="saved-problem"
          name="problem_solved"
          rows={2}
          maxLength={3000}
          defaultValue={problemSolved}
          placeholder="Pierden consultas porque tardan en responder."
          className="field"
        />
      </div>
      <Button variant="ghost" type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar oferta"}
      </Button>
      <ActionFeedback error={error} success={success} />
    </form>
  );
}
