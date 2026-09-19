"use client";
import Link from "next/link";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-[60dvh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-gold">
        <Icon name="globe" width="24" height="24" />
      </div>
      <p className="eyebrow mt-7">Un momento</p>
      <h1 className="display mt-3 text-3xl">No pudimos cargar esta pantalla.</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Vuelve a intentarlo. Si el problema continúa, revisa la conexión y la configuración de tu
        espacio.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-5">
        <Button onClick={reset}>Volver a intentar</Button>
        <Link href="/" className="text-sm text-muted hover:text-gold">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
