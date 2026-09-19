import Link from "next/link";
import { BrandMark } from "@/components/icons";
export default function NotFound() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 py-16 text-center"
    >
      <BrandMark className="h-12 w-12 text-gold" />
      <p className="eyebrow mt-8">404 · Página no encontrada</p>
      <h1 className="display mt-3 text-3xl">Esta oportunidad está en otra parte.</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        El enlace no existe o este elemento no está disponible en tu cuenta.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-void"
      >
        Volver a Cantera
      </Link>
    </main>
  );
}
