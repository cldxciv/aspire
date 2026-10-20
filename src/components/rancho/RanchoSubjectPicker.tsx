import type { Messages } from "@/i18n/messages/types";
import { ASK_SUBJECT_HINTS, type AskSubjectHint } from "@/lib/ask/constants";
import { cn } from "@/lib/cn";

type PanelMessages = Messages<"rancho">["panel"];

/**
 * The subject hint for the next question, in two forms: chips in the empty conversation (before
 * the first question, where there is room), then a compact "Any ▾" select. Both edit the same value.
 * Every chip and select is a 44px tap target. Presentational.
 */
export function RanchoSubjectChips({
  name,
  value,
  onChange,
  messages: t,
}: {
  /** Radio group name (unique per chat). */
  name: string;
  value: AskSubjectHint;
  onChange: (value: AskSubjectHint) => void;
  messages: PanelMessages;
}) {
  return (
    <fieldset data-rancho-subjects="" className="mt-3 min-w-0 pl-10">
      <legend className="mb-1.5 text-xs font-semibold text-muted">{t.subjectHint}</legend>
      <div className="flex flex-wrap gap-1.5">
        {ASK_SUBJECT_HINTS.map((option) => (
          <label
            key={option}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[#cfdcec] bg-white px-3.5 text-xs font-bold text-[#354b66] transition-colors",
              "hover:border-blue has-checked:border-navy has-checked:bg-navy has-checked:text-white",
              "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue",
            )}
          >
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} className="sr-only" />
            {t.subjects[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The compact select, after the first question. `placement="row"`: inside the composer row, next to
 * the field (its label is for screen readers). `placement="line"`: on the disclaimer line under the
 * composer, with a visible "Subject" label, for a chat too narrow to give the field room otherwise.
 * RanchoChat renders both and shows one by the width of the chat (a container query in `className`).
 */
export function RanchoSubjectSelect({
  id,
  placement,
  className,
  value,
  onChange,
  messages: t,
}: {
  id: string;
  placement: "row" | "line";
  /** Its display, which shows or hides this placement (e.g. "hidden @min-[23rem]:flex"). */
  className?: string;
  value: AskSubjectHint;
  onChange: (value: AskSubjectHint) => void;
  messages: PanelMessages;
}) {
  const line = placement === "line";
  return (
    <span className={cn("shrink-0 items-center", className)}>
      <label htmlFor={id} className={line ? "cursor-pointer pr-0.5" : "sr-only"}>
        {t.subjectLegend}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = ASK_SUBJECT_HINTS.find((option) => option === event.target.value);
          if (next) onChange(next);
        }}
        title={t.subjectLegend}
        data-rancho-subject-select={placement}
        className={cn(
          "h-11 max-w-28 cursor-pointer rounded-full font-bold [field-sizing:content] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue",
          line ? "bg-transparent px-1 text-[11px] text-[#315475] hover:bg-surface" : "bg-page px-2.5 text-xs text-[#354b66] hover:bg-surface",
        )}
      >
        {ASK_SUBJECT_HINTS.map((option) => (
          <option key={option} value={option}>
            {t.subjects[option]}
          </option>
        ))}
      </select>
    </span>
  );
}
