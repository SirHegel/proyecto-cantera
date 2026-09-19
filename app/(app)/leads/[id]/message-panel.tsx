"use client";

import { useState, useTransition } from "react";
import { createMessage, type Canal } from "./actions";
import { Button } from "@/components/ui";
import { CopyButton } from "@/components/action-feedback";

export type Mensaje = { subject?: string | null; body: string; adjusted?: boolean };

export type Destinos = {
  email: string | null;
  instagram: string | null;
  linkedin: string | null;
};

const CANALES: { key: Canal; label: string; sinDestino: string }[] = [
  { key: "email", label: "Email", sinDestino: "No encontramos un email público" },
  { key: "instagram", label: "Instagram", sinDestino: "No encontramos su Instagram" },
  { key: "linkedin", label: "LinkedIn", sinDestino: "No encontramos su LinkedIn" },
];

export function MessagePanel({
  leadId,
  negocio,
  existentes,
  destinos,
  disponible,
}: {
  leadId: string;
  negocio: string;
  existentes: Partial<Record<Canal, Mensaje>>;
  destinos: Destinos;
  disponible: boolean;
}) {
  // Arranca en el primer canal donde realmente se puede escribir.
  const primero = (CANALES.find((c) => destinos[c.key])?.key ?? "email") as Canal;
  const [canal, setCanal] = useState<Canal>(primero);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!disponible) {
    return (
      <div className="rounded-card border border-line bg-surface p-5">
        <p className="text-[13px] text-muted">
          El mensaje se escribe a partir del ángulo. Créalo primero.
        </p>
      </div>
    );
  }

  const actual = existentes[canal];
  const destino = destinos[canal];
  const info = CANALES.find((c) => c.key === canal)!;

  const abrir = () => {
    if (!destino) return null;
    if (canal === "email") {
      const asunto = encodeURIComponent(actual?.subject ?? "");
      const cuerpo = encodeURIComponent(actual?.body ?? "");
      return `mailto:${encodeURIComponent(destino)}?subject=${asunto}&body=${cuerpo}`;
    }
    try {
      const url = new URL(destino);
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  };

  const href = abrir();

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {CANALES.map((c) => (
          <button
            key={c.key}
            onClick={() => {
              setCanal(c.key);
              setError(null);
            }}
            aria-pressed={canal === c.key}
            className={`pill ${
              canal === c.key
                ? "border-gold text-gold"
                : destinos[c.key]
                  ? "border-line text-muted hover:border-line-lit hover:text-ink"
                  : "border-line/50 text-dim"
            }`}
          >
            {c.label}
            {existentes[c.key] && <span className="ml-1.5 text-gold">·</span>}
          </button>
        ))}
      </div>

      <p className="mt-3 text-[12px] text-dim">
        {destino ? (
          <>
            Le escribes a <span className="text-muted">{destino.replace(/^https?:\/\//, "")}</span>
          </>
        ) : (
          info.sinDestino
        )}
      </p>

      {actual ? (
        <div className="mt-4 rounded-card border border-line bg-surface p-5">
          {actual.subject && (
            <p className="mb-4 border-b border-line pb-3 text-sm">
              <span className="text-dim">Asunto: </span>
              {actual.subject}
            </p>
          )}
          <p className="whitespace-pre-line text-sm leading-relaxed">{actual.body}</p>

          <div className="mt-5 flex flex-wrap items-center gap-5">
            <CopyButton
              text={actual.subject ? `${actual.subject}\n\n${actual.body}` : actual.body}
              label="Copiar mensaje"
            />

            {href && (
              <a
                href={href}
                target={canal === "email" ? undefined : "_blank"}
                rel="noopener noreferrer"
                className="text-[13px] text-muted underline underline-offset-4 hover:text-ink"
              >
                {canal === "email" ? "Abrir en tu correo" : `Abrir ${info.label} de ${negocio}`}
              </a>
            )}
          </div>

          <p className="mt-4 text-[12px] text-dim">
            Léelo antes de enviarlo. Si no suena a algo que dirías tú, cámbialo.
          </p>

          {actual.adjusted && (
            <p className="mt-2 text-[12px] text-dim">
              Ajustamos el mensaje para que cumpla las reglas del primer contacto.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  const res = await createMessage(leadId, canal);
                  if (!res.ok) setError(res.message);
                } catch {
                  setError("No pudimos escribir el mensaje. Vuelve a intentarlo.");
                }
              })
            }
          >
            {pending ? "Escribiendo…" : `Escribir para ${info.label}`}
          </Button>
          {error && (
            <p role="alert" className="error-message mt-3">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
