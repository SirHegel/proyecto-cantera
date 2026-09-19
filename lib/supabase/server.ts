import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isLocalMode } from "@/lib/runtime";
import { localSupabaseClient } from "@/lib/local/client";
import { LOCAL_SESSION_COOKIE, localSessionUser } from "@/lib/local/auth";

/** Cliente ligado a la sesión del usuario. Respeta RLS. */
export async function supabaseServer() {
  if (isLocalMode()) {
    const cookieStore = await cookies();
    return localSupabaseClient({
      userId: localSessionUser(cookieStore.get(LOCAL_SESSION_COOKIE)?.value),
    });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      "Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY para usar CANTERA_MODE=supabase.",
    );
  }
  const store = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: el refresco lo hace el middleware.
          }
        },
      },
    },
  );
}
