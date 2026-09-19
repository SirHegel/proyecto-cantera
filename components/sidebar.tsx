"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandMark, Icon, type IconName } from "./icons";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Vista general", icon: "home" },
  { href: "/buscar", label: "Buscar clientes", icon: "search" },
  { href: "/leads", label: "Mis leads", icon: "leads" },
  { href: "/seguimientos", label: "Seguimientos", icon: "calendar" },
  { href: "/configuracion", label: "Configuración", icon: "settings" },
];
export function Sidebar({
  email,
  isAdmin,
  localMode = false,
}: {
  email: string;
  isAdmin: boolean;
  localMode?: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const nav = isAdmin
    ? [...NAV, { href: "/admin", label: "Administración", icon: "chart" as const }]
    : NAV;
  return (
    <aside className="sticky top-0 z-40 w-full shrink-0 border-b border-line bg-void/95 backdrop-blur-xl md:h-dvh md:w-[240px] md:border-r md:border-b-0 xl:w-[256px]">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-5 py-4 md:px-6 md:py-8">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="Cantera, inicio"
            onClick={() => setOpen(false)}
          >
            <BrandMark className="h-9 w-9 shrink-0 text-gold" />
            <div>
              <p className="display text-xl tracking-tight">
                cantera<span className="text-gold">.</span>
              </p>
              <p className="mt-0.5 text-[10px] tracking-[.16em] text-dim">
                ENCUENTRA. CONECTA. CRECE.
              </p>
            </div>
          </Link>
          <button
            ref={toggleRef}
            onClick={() => setOpen(!open)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted md:hidden"
            aria-expanded={open}
            aria-controls="main-navigation"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
        <div
          id="main-navigation"
          className={`${open ? "flex" : "hidden"} max-h-[calc(100dvh-76px)] flex-1 flex-col overflow-y-auto md:flex md:max-h-none`}
        >
          <p className="eyebrow mb-3 hidden px-7 pt-3 md:block">Tu espacio de trabajo</p>
          <nav aria-label="Navegación principal" className="space-y-1 px-3 pb-5">
            {nav.map((item) => {
              const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-medium transition-colors ${active ? "bg-gold/10 text-gold" : "text-muted hover:bg-surface hover:text-ink"}`}
                >
                  <Icon name={item.icon} className="h-[18px] w-[18px]" />
                  {item.label}
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" />}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto px-5 pb-5">
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2 text-[12px] font-medium">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${localMode ? "bg-gold" : "bg-[#a7bf91]"}`}
                />
                {localMode ? "Espacio local" : "Espacio conectado"}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-dim">
                {localMode
                  ? "Tus cuentas y oportunidades se guardan en este equipo. Conecta servicios para buscar negocios reales."
                  : "Cada buena conversación empieza con una oportunidad."}
              </p>
              {localMode && (
                <Link
                  href="/configuracion"
                  onClick={() => setOpen(false)}
                  className="mt-3 inline-flex items-center gap-2 text-[11px] text-gold"
                >
                  Ver configuración <Icon name="arrow" width="13" height="13" />
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-line px-5 py-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-sm font-medium text-gold">
              {email.slice(0, 1).toUpperCase() || "C"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium">
                {email.split("@")[0] || "Mi espacio Cantera"}
              </p>
              <p className="mt-1 truncate text-[10px] text-dim">{email}</p>
            </div>
            {
              <form action="/auth/signout" method="post">
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-dim hover:bg-raised hover:text-ink"
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                >
                  <Icon name="logout" width="17" height="17" />
                </button>
              </form>
            }
          </div>
        </div>
      </div>
    </aside>
  );
}
