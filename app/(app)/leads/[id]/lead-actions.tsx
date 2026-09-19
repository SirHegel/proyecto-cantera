"use client";
import { useState } from "react";
import { ESTADOS, type Estado } from "@/lib/crm";
import { addNote, logFollowup, scheduleFollowup, setStatus } from "./status-actions";
import { ActionFeedback, useActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui";

export function LeadActions({
  leadId,
  estado,
  seguimiento,
  seguimientosHechos,
}: {
  leadId: string;
  estado: Estado;
  seguimiento: string | null;
  seguimientosHechos: number;
}) {
  const { pending, error, success, run } = useActionFeedback();
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const finished = estado === "cerrado" || estado === "descartado";
  const exhausted = seguimientosHechos >= 2;
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="lead-status" className="field-label">
          Estado de la oportunidad
        </label>
        <select
          id="lead-status"
          value={estado}
          disabled={pending}
          onChange={(event) =>
            run(() => setStatus(leadId, event.target.value as Estado), "Estado actualizado.")
          }
          className="field"
        >
          {(Object.entries(ESTADOS) as [Estado, string][]).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="border-t border-line pt-5">
        <p className="field-label">Próximo seguimiento</p>
        {finished ? (
          <p className="text-[12px] leading-relaxed text-muted">
            La oportunidad está {estado === "cerrado" ? "cerrada" : "descartada"}. Cambia su estado
            para retomar la conversación.
          </p>
        ) : (
          <>
            <p className="text-[13px] text-muted">
              {seguimiento
                ? new Date(seguimiento).toLocaleDateString("es", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "Sin fecha programada"}
            </p>
            {exhausted && (
              <p className="mt-3 text-[12px] leading-relaxed text-dim">
                Completaste la secuencia de dos seguimientos. Puedes programar otra fecha si la
                conversación sigue abierta.
              </p>
            )}
            {seguimiento && (
              <Button
                disabled={pending}
                variant="ghost"
                className="mt-3 w-full"
                onClick={() => run(() => logFollowup(leadId), "Seguimiento registrado.")}
              >
                {pending ? "Guardando…" : "Ya le escribí"}
              </Button>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (date)
                  run(async () => {
                    await scheduleFollowup(leadId, date);
                    setDate("");
                  }, "Fecha de seguimiento guardada.");
              }}
              className="mt-4"
            >
              <label htmlFor="followup-date" className="field-label text-[12px]">
                Elegir otra fecha
              </label>
              <input
                id="followup-date"
                type="date"
                value={date}
                min={minDate}
                disabled={pending}
                onChange={(event) => setDate(event.target.value)}
                className="field"
              />
              <Button
                variant="ghost"
                type="submit"
                className="mt-3 w-full"
                disabled={pending || !date}
              >
                Programar seguimiento
              </Button>
            </form>
          </>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await addNote(leadId, note);
            setNote("");
          }, "Nota guardada en el historial.");
        }}
        className="border-t border-line pt-5"
      >
        <label htmlFor="lead-note" className="field-label">
          Una nota para recordar
        </label>
        <textarea
          id="lead-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Qué conversaron, qué necesita, cuál es el siguiente paso…"
          className="field"
        />
        <Button
          variant="ghost"
          type="submit"
          className="mt-3 w-full"
          disabled={pending || !note.trim()}
        >
          {pending ? "Guardando…" : "Guardar nota"}
        </Button>
      </form>
      <ActionFeedback error={error} success={success} />
    </div>
  );
}
