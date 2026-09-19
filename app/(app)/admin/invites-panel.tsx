"use client";
import { inviteEmail, revokeInvite } from "./actions";
import { Button } from "@/components/ui";
import { ActionFeedback, useActionFeedback } from "@/components/action-feedback";
type Invite = { email: string; used_at: string | null; created_at: string };
export function InvitesPanel({ invites }: { invites: Invite[] }) {
  const { pending, error, success, run } = useActionFeedback();
  const unused = invites.filter((i) => !i.used_at);
  const used = invites.filter((i) => i.used_at);
  return (
    <div className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <form
        action={(fd) =>
          run(
            () => inviteEmail(fd),
            "Correo autorizado. La persona ya puede registrarse en este espacio.",
          )
        }
      >
        <label htmlFor="invite-email" className="field-label">
          Correo de la persona que quieres autorizar
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="invite-email"
            type="email"
            name="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="nombre@correo.com"
            className="field !w-auto min-w-0 flex-1"
          />
          <Button variant="ghost" type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Autorizar correo"}
          </Button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-dim">
          Se habilita el registro para este correo. No se envía un mensaje automático de invitación.
        </p>
      </form>
      <ActionFeedback error={error} success={success} />
      {unused.length > 0 && (
        <div className="mt-6">
          <p className="eyebrow">Pendientes de registro</p>
          <div className="mt-3 divide-y divide-line">
            {unused.map((invite) => (
              <div key={invite.email} className="flex items-center justify-between gap-3 py-3">
                <p className="min-w-0 text-[13px] text-muted">{invite.email}</p>
                <button
                  disabled={pending}
                  onClick={() => run(() => revokeInvite(invite.email), "Autorización retirada.")}
                  className="pill shrink-0"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {used.length > 0 && (
        <p className="mt-4 text-[12px] text-dim">{used.length} invitaciones utilizadas.</p>
      )}
    </div>
  );
}
