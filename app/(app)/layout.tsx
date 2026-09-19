import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { supabaseServer } from "@/lib/supabase/server";
import { isLocalMode } from "@/lib/runtime";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();
  const localMode = isLocalMode();
  return (
    <div className="min-h-dvh md:flex">
      <Sidebar
        email={profile?.email ?? user.email ?? ""}
        isAdmin={profile?.role === "admin"}
        localMode={localMode}
      />
      <div className="min-w-0 flex-1">
        <div className="hidden h-[76px] items-center justify-between gap-4 border-b border-line px-8 text-[11px] text-dim md:flex xl:px-12">
          <span>
            CANTERA <span className="mx-3 text-line-lit">/</span> Tu próxima oportunidad
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${localMode ? "bg-gold" : "bg-[#a7bf91]"}`}
            />
            {localMode ? "Modo local · guardado en este equipo" : "Tu espacio de prospección"}
          </span>
        </div>
        <main
          id="main-content"
          className="px-4 py-7 outline-none sm:px-7 md:px-8 md:py-10 xl:px-12"
          tabIndex={-1}
        >
          <div className="mx-auto max-w-[1160px]">{children}</div>
        </main>
        <footer className="px-4 py-6 text-center text-[10px] tracking-wide text-dim sm:px-7 md:px-8">
          Cantera · Convierte oportunidades en conversaciones.
        </footer>
      </div>
    </div>
  );
}
