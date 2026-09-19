import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalMode } from "@/lib/runtime";
import { permitsLocalRequest } from "@/lib/local/access";

const PUBLIC = ["/login", "/auth", "/demo-site"];

export async function proxy(req: NextRequest) {
  if (isLocalMode()) {
    if (!permitsLocalRequest(req.headers, req.method)) {
      return new NextResponse("El modo local solo está disponible desde este equipo (localhost).", {
        status: 403,
      });
    }
    return NextResponse.next({ request: req });
  }
  // Cron authenticates using its own bearer secret, independently of browser cookies.
  if (req.nextUrl.pathname === "/api/cron/daily") return NextResponse.next({ request: req });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return new NextResponse(
      "Falta configurar Supabase. Revisa las variables de entorno o activa CANTERA_MODE=local.",
      { status: 503 },
    );
  }
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  // No meter lógica entre createServerClient y getUser: rompe el refresco.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
