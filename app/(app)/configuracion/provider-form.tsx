"use client";
import { useState, useTransition } from "react";
import { saveProviderSettings } from "./provider-actions";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

export function ProviderForm({
  configured,
  mode,
  editable = true,
}: {
  configured: { places: boolean; ai: boolean };
  mode: "fixture" | "live";
  editable?: boolean;
}) {
  const [selected, setSelected] = useState(mode);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <div className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold">
          <Icon name="globe" />
        </div>
        <div>
          <h2 className="display text-lg">Búsquedas reales</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Conecta Google Places para encontrar negocios y OpenAI para analizar oportunidades y
            preparar mensajes.
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ["Google Places", configured.places],
          ["OpenAI", configured.ai],
        ].map(([label, connected]) => (
          <div
            key={String(label)}
            className="flex items-center justify-between gap-2 rounded-lg border border-line bg-void/40 p-3"
          >
            <span className="text-[12px]">{label}</span>
            <span className={`status-pill ${connected ? "!text-[#bed1a9]" : "!text-dim"}`}>
              {connected ? "Clave guardada" : "Sin clave"}
            </span>
          </div>
        ))}
      </div>
      {editable ? (
        <form
          action={(fd) => {
            setError(null);
            setSaved(false);
            start(async () => {
              try {
                await saveProviderSettings(fd);
                setSaved(true);
              } catch (e) {
                setError(
                  e instanceof Error && !e.message.includes("Server Components")
                    ? e.message
                    : "No pudimos guardar la conexión. Revisa los datos e inténtalo otra vez.",
                );
              }
            });
          }}
          className="mt-6"
        >
          <fieldset>
            <legend className="field-label">Modo de búsqueda</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  value: "fixture" as const,
                  label: "Explorar con ejemplos",
                  text: "Datos ficticios, sin consumo externo.",
                },
                {
                  value: "live" as const,
                  label: "Buscar negocios reales",
                  text: "Requiere tus claves de ambos servicios.",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${selected === option.value ? "border-gold/50 bg-gold/5" : "border-line"}`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={option.value}
                    checked={selected === option.value}
                    onChange={() => setSelected(option.value)}
                    className="mt-0.5 accent-[#e8c76b]"
                  />
                  <span>
                    <span className="block text-[13px] font-medium">{option.label}</span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-dim">
                      {option.text}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="places-key" className="field-label">
                Clave de Google Places
              </label>
              <input
                id="places-key"
                name="google_places_api_key"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                className="field"
                placeholder={
                  configured.places
                    ? "Guardada · deja vacío para conservar"
                    : "Pega tu clave de Google Places"
                }
              />
            </div>
            <div>
              <label htmlFor="openai-key" className="field-label">
                Clave de OpenAI
              </label>
              <input
                id="openai-key"
                name="openai_api_key"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                className="field"
                placeholder={
                  configured.ai ? "Guardada · deja vacío para conservar" : "Pega tu clave de OpenAI"
                }
              />
            </div>
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-dim">
            <Icon name="shield" width="15" height="15" className="mt-0.5 shrink-0" />
            Las claves se guardan cifradas en este equipo, fuera del repositorio. Deja un campo
            vacío para conservar su clave. Las búsquedas reales usan el saldo y las cuotas de tus
            proveedores.
          </p>
          <div className="mt-5">
            <Button type="submit" disabled={pending} variant="ghost">
              {pending ? "Guardando conexión…" : "Guardar conexión"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="error-message mt-4">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="mt-4 text-[13px] text-[#bed1a9]">
              Configuración guardada. Ya puedes iniciar una nueva búsqueda.
            </p>
          )}
        </form>
      ) : (
        <p className="notice mt-5">
          Las conexiones de este espacio son administradas por el responsable de la instalación.
          Modo actual: {mode === "live" ? "búsquedas reales" : "datos de ejemplo"}.
        </p>
      )}
    </div>
  );
}
