"use client";
import { useState, useTransition } from "react";

export function useActionFeedback() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  function run(action: () => Promise<unknown>, message?: string) {
    setError(null);
    setSuccess(null);
    start(async () => {
      try {
        await action();
        if (message) setSuccess(message);
      } catch {
        setError("No pudimos guardar el cambio. Revisa tu conexión y vuelve a intentarlo.");
      }
    });
  }
  return { pending, error, success, run };
}
export function ActionFeedback({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="error-message mt-3">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-3 text-[12px] text-[#bed1a9]">
          {success}
        </p>
      )}
    </>
  );
}
export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <span>
      <button
        type="button"
        onClick={async () => {
          setError(false);
          try {
            if (!navigator.clipboard) throw new Error("Clipboard unavailable");
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            setError(true);
          }
        }}
        className="min-h-10 text-[13px] text-gold underline underline-offset-4"
      >
        {copied ? "Copiado ✓" : label}
      </button>
      {error && (
        <span role="alert" className="mt-1 block text-[12px] text-muted">
          Tu navegador no permite copiar. Selecciona el texto y cópialo manualmente.
        </span>
      )}
    </span>
  );
}
