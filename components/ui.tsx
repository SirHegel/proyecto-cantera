import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "./icons";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}
export function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <p className="text-[13px] text-muted">{label}</p>
      <p className="tnum display mt-3 text-3xl leading-none">{value}</p>
    </Card>
  );
}
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-45";
const variants = {
  primary: "bg-gold text-void hover:bg-[#f3d88d]",
  ghost: "border border-line text-ink hover:border-line-lit hover:bg-raised",
};
type ButtonProps = ComponentProps<"button"> & { variant?: keyof typeof variants };
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface/40 px-6 py-14 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-raised text-gold">
        <Icon name="leads" />
      </div>
      <h2 className="display text-xl">{title}</h2>
      {body && <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
export function NotBuiltYet({ what, phase }: { what: string; phase: number }) {
  return (
    <Card>
      <Eyebrow>Fase {phase}</Eyebrow>
      <p className="mt-3 text-sm text-muted">{what} todavía no está disponible.</p>
    </Card>
  );
}
