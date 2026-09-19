"use client";
import { ActionFeedback, useActionFeedback } from "@/components/action-feedback";
import { logFollowup } from "@/app/(app)/leads/[id]/status-actions";
import { Icon } from "@/components/icons";
export function FollowupButton({ leadId }: { leadId: string }) {
  const { pending, error, run } = useActionFeedback();
  return (
    <div>
      <button disabled={pending} onClick={() => run(() => logFollowup(leadId))} className="pill">
        <Icon name="check" width="15" height="15" />
        {pending ? "Registrando…" : "Ya le escribí"}
      </button>
      <ActionFeedback error={error} />
    </div>
  );
}
