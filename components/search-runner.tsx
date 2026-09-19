"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { Button } from "./ui";
type State = { steps: string[]; pct: number; error: string | null; done: boolean };
export function SearchRunner({ searchId }: { searchId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({
    steps: ["Conectando con tu búsqueda…"],
    pct: 5,
    error: null,
    done: false,
  });
  useEffect(() => {
    let stream: EventSource | undefined;
    let disposed = false;
    // El arranque diferido evita duplicar solicitudes durante la comprobación
    // de efectos de React; la limpieza cierra conexiones al salir de la vista.
    const timer = setTimeout(() => {
      if (disposed) return;
      stream = new EventSource(`/api/searches/${searchId}/run`);
      const add = (text: string, pct: number) =>
        setState((prev) => ({
          ...prev,
          steps: [...prev.steps, text],
          pct: Math.max(prev.pct, pct),
        }));
      stream.onmessage = (event) => {
        if (disposed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "stage") add(data.message, 25);
          if (data.type === "count")
            add(
              `${data.found} negocios encontrados · ${data.nuevos} nuevos para ti${data.repetidos ? ` · ${data.repetidos} ya registrados` : ""}`,
              40,
            );
          if (data.type === "filtered")
            add(
              `${data.candidatos} negocios encajan con tu oferta · ${data.descartados} descartados`,
              55,
            );
          if (data.type === "progress")
            setState((prev) => {
              const steps = [...prev.steps];
              const text = `${data.label}: ${data.done} de ${data.total}`;
              if (steps.at(-1)?.startsWith(`${data.label}:`)) steps[steps.length - 1] = text;
              else steps.push(text);
              return {
                ...prev,
                steps,
                pct: Math.max(prev.pct, 55 + Math.min(1, data.done / Math.max(1, data.total)) * 20),
              };
            });
          if (data.type === "qualified")
            add(
              `${data.oportunidades} buenas oportunidades${data.recortado > 0 ? ` · ${data.recortado} pendientes por límite diario` : ""}`,
              95,
            );
          if (data.type === "error") {
            setState((prev) => ({
              ...prev,
              error: data.message || "No pudimos completar esta búsqueda.",
            }));
            stream?.close();
          }
          if (data.type === "done") {
            setState((prev) => ({ ...prev, done: true, pct: 100 }));
            stream?.close();
            router.refresh();
          }
        } catch {
          setState((prev) => ({
            ...prev,
            error:
              "No pudimos leer el avance de la búsqueda. Recarga la página para comprobar su estado.",
          }));
          stream?.close();
        }
      };
      stream.onerror = () => {
        stream?.close();
        if (!disposed)
          setState((prev) =>
            prev.done
              ? prev
              : {
                  ...prev,
                  error:
                    "Se interrumpió la conexión. Vuelve a cargar la búsqueda para comprobar su estado.",
                },
          );
      };
    }, 0);
    return () => {
      disposed = true;
      clearTimeout(timer);
      stream?.close();
    };
  }, [searchId, router]);
  if (state.error)
    return (
      <div className="rounded-card border border-line bg-surface p-6">
        <div className="flex items-center gap-3">
          <Icon name="search" className="text-gold" />
          <h2 className="display text-lg">La búsqueda necesita atención</h2>
        </div>
        <p role="alert" className="mt-4 text-sm leading-relaxed text-muted">
          {state.error}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button onClick={() => window.location.reload()} variant="ghost">
            Volver a cargar
          </Button>
          <Link href="/buscar" className="text-[13px] text-gold">
            Nueva búsqueda →
          </Link>
        </div>
      </div>
    );
  return (
    <div className="rounded-card border border-line bg-surface p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Tu próxima oportunidad está en camino</p>
          <h2 className="display mt-2 text-xl">
            {state.done ? "Tu búsqueda está lista" : "Buscando con intención"}
          </h2>
        </div>
        <span className="tnum display text-3xl text-gold">
          {Math.round(state.pct)}
          <span className="text-sm">%</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Progreso de la búsqueda"
        aria-valuenow={Math.round(state.pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-5 h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-500"
          style={{ width: `${state.pct}%` }}
        />
      </div>
      <ol className="mt-6 space-y-4" aria-live="polite">
        {state.steps.map((text, index) => (
          <li key={index} className="flex items-start gap-3 text-[13px]">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${index === state.steps.length - 1 && !state.done ? "animate-pulse bg-gold" : "bg-line-lit"}`}
            />
            <span className={index === state.steps.length - 1 ? "text-ink" : "text-dim"}>
              {text}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-6 border-t border-line pt-4 text-[11px] leading-relaxed text-dim">
        El avance refleja el trabajo real de cada etapa. Mantén esta pantalla abierta hasta que
        termine.
      </p>
    </div>
  );
}
