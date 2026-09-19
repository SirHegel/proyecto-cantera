import { supabaseServer } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import { redirect } from "next/navigation";
import { isLocalMode } from "@/lib/runtime";
import Link from "next/link";
import { localSignIn, localSignUp } from "./actions";

async function sendLink(formData: FormData) {
  "use server";
  if (isLocalMode()) redirect("/login");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return;

  const supabase = await supabaseServer();
  const origin = process.env.DEMO_SITE_BASE ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm`, shouldCreateUser: true },
  });

  if (error) {
    console.error("[auth] No se pudo enviar el enlace:", error.message);
    redirect("/login?error=send");
  }
  redirect("/login?sent=1");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; mode?: string }>;
}) {
  const { sent, error, mode } = await searchParams;
  if (isLocalMode()) {
    const client = await supabaseServer();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) redirect("/");
    const registering = mode === "register";
    return (
      <main className="flex min-h-dvh items-center justify-center px-5 py-12">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl sm:p-9">
          <p className="display text-lg">La Cantera</p>
          <p className="mt-1 text-xs text-dim">Tu espacio para encontrar oportunidades</p>
          <h1 className="display mt-8 text-3xl">
            {registering ? "Crea tu cuenta" : "Bienvenido de nuevo"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Tu cuenta y tus leads se guardan en este equipo. Cada cuenta tiene su propio espacio de
            trabajo.
          </p>
          <nav
            aria-label="Acceso a tu cuenta"
            className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-line p-1"
          >
            <Link
              href="/login"
              aria-current={!registering ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-center text-sm ${!registering ? "bg-gold text-black" : "text-muted"}`}
            >
              Iniciar sesión
            </Link>
            <Link
              href="/login?mode=register"
              aria-current={registering ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-center text-sm ${registering ? "bg-gold text-black" : "text-muted"}`}
            >
              Crear cuenta
            </Link>
          </nav>
          {error && (
            <p
              role="alert"
              className="mt-5 rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm"
            >
              {error}
            </p>
          )}
          <form action={registering ? localSignUp : localSignIn} className="mt-6 space-y-4">
            {registering && (
              <label className="block text-sm">
                Nombre
                <input
                  name="fullName"
                  autoComplete="name"
                  minLength={2}
                  maxLength={80}
                  required
                  className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-3"
                />
              </label>
            )}
            <label className="block text-sm">
              Correo electrónico
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-3"
              />
            </label>
            <label className="block text-sm">
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete={registering ? "new-password" : "current-password"}
                minLength={registering ? 8 : 1}
                maxLength={128}
                required
                aria-describedby={registering ? "password-hint" : undefined}
                className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-3"
              />
              {registering && (
                <span id="password-hint" className="mt-2 block text-xs text-dim">
                  Al menos 8 caracteres. El correo identifica tu cuenta local; no requiere
                  confirmación.
                </span>
              )}
            </label>
            <Button type="submit" className="w-full">
              {registering ? "Crear mi cuenta" : "Entrar a mi espacio"}
            </Button>
          </form>
          <p className="mt-6 text-xs leading-relaxed text-dim">
            Las cuentas locales no se sincronizan entre computadores. Guarda una copia de tus datos
            antes de cambiar de equipo.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="display text-[15px]">La Cantera</p>
        <p className="mt-1 text-[11px] tracking-wide text-dim">by Ascendia</p>

        <h1 className="display mt-10 text-3xl leading-tight">Entra a tu cantera</h1>
        <p className="mt-3 text-sm text-muted">
          Te mandamos un enlace de acceso. Sin contraseñas que recordar.
        </p>

        {sent ? (
          <div className="mt-8 rounded-card border border-line bg-surface p-5">
            <p className="text-sm">Listo. Revisa tu correo y abre el enlace.</p>
            <p className="mt-2 text-[13px] text-muted">
              Si no llega en un minuto, mira en spam o vuelve a pedirlo.
            </p>
          </div>
        ) : (
          <form action={sendLink} className="mt-8 space-y-3">
            <input
              aria-label="Correo electrónico"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="tu@correo.com"
              className="w-full rounded-[8px] border border-line bg-surface px-4 py-3 text-sm placeholder:text-dim focus:border-line-lit"
            />
            <Button type="submit" className="w-full">
              Enviar enlace
            </Button>
          </form>
        )}

        {error && (
          <p className="mt-4 text-[13px] text-muted">
            {error === "send"
              ? "No pudimos enviar el enlace. Revisa tu correo y la configuración de acceso e inténtalo de nuevo."
              : "Ese enlace ya se usó o caducó. Pide uno nuevo."}
          </p>
        )}

        <p className="mt-10 text-[12px] leading-relaxed text-dim">
          El acceso es por invitación. Si tu correo no está en la lista de tu programa, el enlace no
          va a crear la cuenta.
        </p>
      </div>
    </div>
  );
}
