import { ButtonLink, DemoBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import type { Program } from "@/lib/types";
import { scheduleFacts } from "./program-facts";

/**
 * "Schedule & fees" panel. Shows duration, delivery mode, daily contact hours,
 * doubt-resolution time, batch size and fees only when the record has them (fees
 * only ever come from verified data); anything missing is routed to a counsellor
 * instead of being filled in. Placeholder records carry a DEMO badge. Server component.
 */
export function ScheduleFees({ program, headingId, locale }: { program: Program; headingId: string; locale: Locale }) {
  const { schedule: t, units } = messagesFor(locale, "programs");
  const common = messagesFor(locale, "common");
  const known = scheduleFacts(program, t.facts, units);
  const hasFees = Boolean(program.feeDisplay?.trim());

  return (
    <div className="rounded-card border border-line bg-white p-6 shadow-soft md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-xl font-extrabold text-navy">
          {t.title}
        </h2>
        {program.status === "placeholder" && <DemoBadge label={common.labels.demo} />}
      </div>
      {known.length > 0 && (
        <dl className="mt-4 divide-y divide-line">
          {known.map((fact) => (
            <div key={fact.label} className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-muted">{fact.label}</dt>
              <dd className="text-right font-bold text-navy">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-4 text-sm leading-relaxed text-muted">
        {known.length === 0 ? t.noneKnown : hasFees ? t.withFees : t.withoutFees} {t.askCounsellor}
      </p>
      <ButtonLink href={localePath("/admissions#enquiry", locale)} className="mt-6 w-full">
        {t.cta}
      </ButtonLink>
    </div>
  );
}
