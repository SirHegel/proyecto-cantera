"use client";
import { useState, useTransition } from "react";
import { createAngle } from "./actions";
import { Button } from "@/components/ui";
import { CopyButton } from "@/components/action-feedback";
import { Icon } from "@/components/icons";
export type Angle = { observation: string; angle: string; demoIdea: string };
export function AnglePanel({
  leadId,
  angle,
  bloqueado,
}: {
  leadId: string;
  angle: Angle | null;
  bloqueado: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (bloqueado) return <p className="notice">{bloqueado}</p>;
  if (!angle)
    return (
      <div>
        <Button
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              try {
                const result = await createAngle(leadId);
                if (!result.ok) setError(result.message);
              } catch {
                setError("No pudimos preparar el ángulo. Vuelve a intentarlo.");
              }
            });
          }}
        >
          <Icon name="sparkles" width="16" height="16" />
          {pending ? "Preparando el ángulo…" : "Crear ángulo de contacto"}
        </Button>
        {error && (
          <p role="alert" className="error-message mt-3">
            {error}
          </p>
        )}
      </div>
    );
  const blocks: [string, string][] = [
    ["Lo que notamos", angle.observation],
    ["Tu ángulo de contacto", angle.angle],
    ["Una idea para mostrar", angle.demoIdea],
  ];
  return (
    <div className="rounded-xl border border-line bg-void/40 p-5">
      <dl className="space-y-5">
        {blocks.map(([key, value]) => (
          <div key={key}>
            <dt className="eyebrow">{key}</dt>
            <dd className="mt-2 text-[13px] leading-relaxed">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <CopyButton
          text={blocks.map(([key, value]) => `${key}: ${value}`).join("\n\n")}
          label="Copiar ángulo"
        />
      </div>
    </div>
  );
}
