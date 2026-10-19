import { ButtonLink, DemoBadge } from "@/components/ui";
import type { Program } from "@/lib/types";
import { scheduleFacts } from "./program-facts";

/**
 * "Schedule & fees" panel. Shows duration, delivery mode, daily contact hours,
 * doubt-resolution time, batch size and fees only when the record has them (fees
 * only ever come from verified data); anything missing is routed to a counsellor
 * instead of being filled in. Placeholder records carry a DEMO badge.
 */
export function ScheduleFees({ program, headingId }: { program: Program; headingId: string }) {
  const known = scheduleFacts(program);
  const hasFees = Boolean(program.feeDisplay?.trim());

  return (
    <div className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-xl font-extrabold text-navy">
          Schedule &amp; fees
        </h2>
        {program.status === "placeholder" && <DemoBadge label="Demo" />}
      </div>
      {known.length > 0 && (
        <dl className="mt-3 divide-y divide-line">
          {known.map((fact) => (
            <div key={fact.label} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-muted">{fact.label}</dt>
              <dd className="text-right font-bold text-navy">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-sm text-muted">
        {known.length === 0
          ? "Duration, timings, batch details and fees for this program are confirmed individually by Aspire's admissions team."
          : hasFees
            ? "Batch dates and seat availability are confirmed by Aspire's admissions team."
            : "Fees, batch dates and scholarships are confirmed individually by Aspire's admissions team."}{" "}
        Ask a counsellor for current details.
      </p>
      <ButtonLink href="/admissions#enquiry" className="mt-5 w-full">
        Ask a counsellor
      </ButtonLink>
    </div>
  );
}
