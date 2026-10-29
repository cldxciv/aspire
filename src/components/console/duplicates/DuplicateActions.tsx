"use client";

import { LoaderCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { familyRequests } from "@/components/console/details/api";
import type { FamilyMessages } from "@/components/console/details/messages";
import { crmRequests } from "@/components/crm/api";
import { ActionFeedback, CrmDialog, useCrmAction } from "@/components/crm/client-kit";
import type { CrmMessages } from "@/components/crm/format";
import { Button } from "@/components/ui";

function Spinner() {
  return <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />;
}

/**
 * "Not the same family" (docs/admin-phase-1b-plan.md §5.F; owner: 1B-FAMILY): POST …/duplicates
 * `{ otherLeadId, action: "dismiss" }`. The card stays until the next visit and says what happened
 * (focus moves to that line), so the result is never lost to a refresh.
 */
export function DismissDuplicateButton({
  leadId,
  otherLeadId,
  label,
  ariaLabel,
  done,
  t,
  pagePath,
}: {
  leadId: string;
  otherLeadId: string;
  label: string;
  ariaLabel: string;
  done: string;
  t: Pick<CrmMessages, "errors">;
  pagePath: string;
}) {
  const action = useCrmAction(t, pagePath, { refresh: false });
  const [dismissed, setDismissed] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);

  async function dismiss() {
    const data = await action.run(familyRequests.dismissDuplicate(leadId, otherLeadId), done);
    if (data === null) return;
    setDismissed(true);
    requestAnimationFrame(() => statusRef.current?.focus());
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {!dismissed && (
        <Button variant="outline" onClick={dismiss} disabled={action.pending} aria-label={ariaLabel}>
          {action.pending && <Spinner />}
          {label}
        </Button>
      )}
      <p ref={statusRef} tabIndex={-1} role="status" className="text-sm font-semibold text-success focus:outline-none">
        {dismissed ? done : ""}
      </p>
      <p role="alert" className="text-sm font-semibold text-danger">
        {action.error ?? ""}
      </p>
    </div>
  );
}

/**
 * "Mark this enquiry lost: duplicate" with a confirmation (the existing stage change, reason
 * `duplicate`). Rendered for as long as the box shows, so its result line survives the refresh that
 * moves the enquiry to Lost; `lost` hides the button once it is.
 */
export function MarkDuplicateLostButton({
  leadId,
  lost = false,
  f,
  t,
  pagePath,
}: {
  leadId: string;
  /** The enquiry is already lost (or enrolled / erased): no button. */
  lost?: boolean;
  f: FamilyMessages["duplicates"];
  t: Pick<CrmMessages, "errors" | "common">;
  pagePath: string;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const action = useCrmAction(t, pagePath);

  async function confirm() {
    const data = await action.run(crmRequests.changeStage(leadId, "lost", "duplicate"), f.markLostDone);
    if (data === null) return;
    setOpen(false);
    setStatus(f.markLostDone);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {!lost && (
        <Button
          variant="outline"
          onClick={() => {
            action.reset();
            setOpen(true);
          }}
        >
          {f.markLost}
        </Button>
      )}
      <p role="status" className="text-sm font-semibold text-success">
        {status}
      </p>
      <CrmDialog open={open} titleId={titleId} onClose={() => setOpen(false)}>
        <div className="p-5 md:p-6">
          <h2 id={titleId} className="text-lg font-extrabold text-navy">
            {f.markLostTitle}
          </h2>
          <p className="mt-2 text-sm text-ink">{f.markLostBody}</p>
          <ActionFeedback status="" error={action.error} className="mt-3" />
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="dark" onClick={confirm} disabled={action.pending}>
              {action.pending && <Spinner />}
              {f.markLostConfirm}
            </Button>
          </div>
        </div>
      </CrmDialog>
    </div>
  );
}
