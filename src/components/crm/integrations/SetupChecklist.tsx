import { CheckCircle2, Circle, CircleHelp } from "lucide-react";
import { format } from "@/i18n/format";
import { META_GRAPH_VERSION_DEFAULT } from "@/lib/crm/lead-ops-types";
import { META_REQUIRED_SCOPES, type MetaIntegrationView } from "@/lib/crm/meta/types";
import { cn } from "@/lib/cn";
import { CHECKLIST_STEPS, checklistStates, type MetaMessages, type StepState } from "./model";

/**
 * The owner's setup guide (docs/lead-routing-plan.md Part 2: Step 0, steps 1–13 and 6b) with LIVE
 * ticks: a step shows "Done" only when the CRM has seen proof of it (ids saved, Meta's handshake,
 * the token check, a lead actually read). State is written out, never shown by colour alone.
 * Server-safe.
 */
export function SetupChecklist({ view, m }: { view: MetaIntegrationView; m: MetaMessages }) {
  const c = m.checklist;
  const states = checklistStates(view);
  const origin = view.callbackUrl.replace(/\/api\/integrations\/meta\/webhook$/, "");
  const values = {
    privacyUrl: `${origin}/privacy`,
    version: view.admin?.config.value.graphVersion ?? META_GRAPH_VERSION_DEFAULT,
    scopes: META_REQUIRED_SCOPES.join(", "),
  };
  const done = CHECKLIST_STEPS.filter((step) => states.steps[step] === "done").length + (states.step0 === "done" ? 1 : 0);
  return (
    <section aria-labelledby="meta-checklist-heading" className="space-y-4 rounded-card border border-line bg-white p-5 shadow-soft">
      <div>
        <h2 id="meta-checklist-heading" className="text-lg font-extrabold text-navy">
          {c.heading}
        </h2>
        <p className="mt-1 text-sm text-muted">{c.lead}</p>
        <p className="mt-1 text-sm font-bold text-navy">{format(c.progress, { done, total: CHECKLIST_STEPS.length + 1 })}</p>
      </div>
      <ol className="space-y-3">
        <li className="rounded-control border border-line p-3">
          <StepHeader state={states.step0} title={c.step0.title} m={m} />
          <p className="mt-1 text-sm text-ink">{c.step0.body}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
            {c.step0.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
            <li className={states.step0 === "done" ? "text-success" : "font-bold text-danger"}>{c.step0.serverKey}</li>
          </ul>
        </li>
        {CHECKLIST_STEPS.map((step, index) => {
          const text = c.steps[step];
          return (
            <li key={step} className="rounded-control border border-line p-3">
              <StepHeader state={states.steps[step]} title={`${index + 1}. ${text.title}`} m={m} />
              <p className="mt-1 text-sm text-ink">{format(text.body, values)}</p>
              {"more" in text ? (
                <div className="mt-2 rounded-control bg-surface p-3">
                  <p className="text-sm font-bold text-navy">{text.more.title}</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink">
                    {text.more.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StepHeader({ state, title, m }: { state: StepState; title: string; m: MetaMessages }) {
  const c = m.checklist;
  const label = state === "done" ? c.done : state === "todo" ? c.todo : c.manual;
  const Icon = state === "done" ? CheckCircle2 : state === "todo" ? Circle : CircleHelp;
  return (
    <p className="flex flex-wrap items-center gap-2">
      <Icon aria-hidden="true" className={cn("size-5 shrink-0", state === "done" ? "text-success" : state === "todo" ? "text-[#8a99ad]" : "text-[#8b5b00]")} />
      <span className="font-extrabold text-navy">{title}</span>
      <span
        className={cn(
          "rounded-md px-2 py-0.5 text-xs font-bold",
          state === "done" ? "bg-success-soft text-[#14744d]" : state === "todo" ? "bg-surface text-muted" : "bg-[#fff3d2] text-[#8b5b00]",
        )}
      >
        {label}
      </span>
    </p>
  );
}
