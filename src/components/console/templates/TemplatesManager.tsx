"use client";

import { Archive, CheckCircle2, Clock, LoaderCircle, Pencil, RotateCcw } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "@/components/crm/client-kit";
import type { CrmMessages } from "@/components/crm/format";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { fillTemplate, TEMPLATE_BODY_MAX } from "@/lib/crm/console/templates/fill";
import { CONSOLE_URL_MAX, TEMPLATE_LANGS, type TemplateLang, type TemplateStatus, type WaTemplate } from "@/lib/crm/console/types";
import { callsRequests } from "../calls/api";
import type { CallsMessages } from "../calls/messages";
import { templatePurpose } from "../calls/WhatsAppComposer";
import { bodyIssueMessages, prospectusLinkValid, sampleSlotValues, slotList, statusActions, templateStatusText } from "./template-forms";

function Spinner() {
  return <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />;
}

const STATUS_STYLE: Readonly<Record<TemplateStatus, { box: string; Icon: typeof Clock }>> = {
  draft: { box: "border-[#e3c46a] bg-[#fffbeb] text-[#5c4a12]", Icon: Clock },
  approved: { box: "border-[#bfe5cf] bg-[#e7f7ee] text-[#0f5a3c]", Icon: CheckCircle2 },
  retired: { box: "border-line bg-[#f4f7fb] text-[#354b66]", Icon: Archive },
};

export type TemplatesManagerProps = {
  templates: WaTemplate[];
  /** Super admin: edit, approve / retire / back to draft, prospectus link. Everyone else reads. */
  canManage: boolean;
  prospectus: { url: string | null; version: number };
  locale: Locale;
  pagePath: string;
  t: Pick<CrmMessages, "errors">;
  c: CallsMessages;
};

/**
 * /crm/templates (docs/admin-phase-1b-plan.md §5.D, O4, O5; owner: 1B-CALLS): one card per template
 * with its status (icon + text), its three bodies and a preview with sample slots. Super admins edit
 * one language at a time, approve, retire or send back to draft, and set the prospectus link; area
 * heads and admins read. The server checks every write again.
 */
export function TemplatesManager({ templates, canManage, prospectus, locale, pagePath, t, c }: TemplatesManagerProps) {
  const [status, setStatus] = useState("");
  const contexts = [...new Set(templates.map((template) => template.context))];

  return (
    <div className="space-y-6">
      <p role="status" className="text-sm font-semibold text-success">
        {status}
      </p>
      {templates.length === 0 && <p className="rounded-card border border-line bg-white p-6 text-sm text-muted shadow-soft">{c.templates.empty}</p>}
      {contexts.map((context) => (
        <section key={context} aria-labelledby={`tpl-context-${context}`} className="space-y-4">
          <h2 id={`tpl-context-${context}`} className="text-base font-extrabold text-navy">
            {c.templates.context[context] ?? context}
          </h2>
          <ul className="space-y-4">
            {templates
              .filter((template) => template.context === context)
              .map((template) => (
                <li key={template.key}>
                  <TemplateCard template={template} canManage={canManage} locale={locale} pagePath={pagePath} t={t} c={c} onStatus={setStatus} />
                </li>
              ))}
          </ul>
        </section>
      ))}
      <ProspectusCard prospectus={prospectus} canManage={canManage} pagePath={pagePath} t={t} c={c} />
    </div>
  );
}

export function TemplateCard({
  template,
  canManage,
  locale,
  pagePath,
  t,
  c,
  onStatus,
}: {
  template: WaTemplate;
  canManage: boolean;
  locale: Locale;
  pagePath: string;
  t: Pick<CrmMessages, "errors">;
  c: CallsMessages;
  onStatus: (message: string) => void;
}) {
  const k = c.templates;
  const name = templatePurpose(template.key, c.whatsapp);
  const style = STATUS_STYLE[template.status];
  const samples = sampleSlotValues(c);
  const [editing, setEditing] = useState<TemplateLang | null>(null);
  const action = useCrmAction(t, pagePath);

  async function changeStatus(next: TemplateStatus) {
    const done = await action.run<WaTemplate>(callsRequests.templateStatus(template.key, { status: next, expectedVersion: template.version }));
    if (!done) return;
    onStatus(format(next === "approved" ? k.savedApproved : next === "retired" ? k.savedRetired : k.savedBackToDraft, { template: name }));
  }

  return (
    <article aria-labelledby={`tpl-${template.key}`} className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`tpl-${template.key}`} className="text-lg font-extrabold text-navy">
            {name}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold", style.box)}>
              <style.Icon aria-hidden="true" className="size-4" />
              {templateStatusText(template, locale, c)}
            </span>
            <span className="text-muted">
              {format(k.version, { n: template.version })}
            </span>
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {statusActions(template.status).map((next) => (
              <Button
                key={next}
                variant={next === "approved" ? "dark" : "outline"}
                disabled={action.pending}
                aria-label={format(next === "approved" ? k.approveLabel : next === "retired" ? k.retireLabel : k.backToDraftLabel, { template: name })}
                onClick={() => changeStatus(next)}
              >
                {action.pending ? (
                  <Spinner />
                ) : next === "approved" ? (
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                ) : next === "retired" ? (
                  <Archive aria-hidden="true" className="size-4" />
                ) : (
                  <RotateCcw aria-hidden="true" className="size-4" />
                )}
                {next === "approved" ? k.approve : next === "retired" ? k.retire : k.backToDraft}
              </Button>
            ))}
          </div>
        )}
      </div>
      <ActionFeedback status="" error={action.error} className="mt-2" />
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {TEMPLATE_LANGS.map((lang) => (
          <section key={lang} aria-label={`${name} · ${k.bodies[lang]}`} className="min-w-0 rounded-control border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-extrabold text-navy">{k.bodies[lang]}</h4>
              {canManage && (
                <Button variant="outline" aria-haspopup="dialog" aria-label={format(k.editLabel, { lang: k.bodies[lang], template: name })} onClick={() => setEditing(lang)}>
                  <Pencil aria-hidden="true" className="size-4" />
                  {k.edit}
                </Button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink" lang={lang === "hi" ? "hi" : "en"}>
              {template.bodies[lang]}
            </p>
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-blue">{k.preview}</summary>
              <p className="whitespace-pre-wrap break-words rounded-control bg-[#f4f7fb] p-2 text-sm text-ink" lang={lang === "hi" ? "hi" : "en"}>
                {fillTemplate(template.bodies[lang], samples)}
              </p>
            </details>
          </section>
        ))}
      </div>
      {canManage && editing && (
        <EditTemplateDialog
          key={`${template.key}-${editing}-${template.version}`}
          template={template}
          lang={editing}
          name={name}
          pagePath={pagePath}
          t={t}
          c={c}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onStatus(format(k.savedDraft, { template: name }));
          }}
        />
      )}
    </article>
  );
}

function EditTemplateDialog({
  template,
  lang,
  name,
  pagePath,
  t,
  c,
  onClose,
  onSaved,
}: {
  template: WaTemplate;
  lang: TemplateLang;
  name: string;
  pagePath: string;
  t: Pick<CrmMessages, "errors">;
  c: CallsMessages;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const k = c.templates;
  const [body, setBody] = useState(template.bodies[lang]);
  const [issues, setIssues] = useState<string[]>([]);
  const action = useCrmAction(t, pagePath);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = bodyIssueMessages(body, c);
    if (found.length > 0) {
      setIssues(found);
      document.getElementById(`${id}-body`)?.focus();
      return;
    }
    setIssues([]);
    const saved = await action.run<WaTemplate>(callsRequests.editTemplate(template.key, { lang, body: body.trim(), expectedVersion: template.version }));
    if (saved) onSaved();
  }

  return (
    <CrmDialog open titleId={`${id}-title`} onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="p-5 md:p-6" aria-busy={action.pending || undefined}>
        <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
          {format(k.editTitle, { template: name, lang: k.bodies[lang] })}
        </h2>
        {template.status === "approved" && <p className="mt-2 rounded-control border border-[#e3c46a] bg-[#fffbeb] p-3 text-sm text-[#5c4a12]">{k.approvedWarning}</p>}
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor={`${id}-body`} className={labelClasses}>
            {k.body}
          </label>
          <textarea
            id={`${id}-body`}
            value={body}
            rows={8}
            lang={lang === "hi" ? "hi" : "en"}
            aria-invalid={issues.length > 0 ? true : undefined}
            aria-describedby={`${id}-help${issues.length > 0 ? ` ${id}-issues` : ""}`}
            onChange={(event) => setBody(event.target.value)}
            className={cn(fieldClasses, "min-h-48")}
          />
          <p id={`${id}-help`} className="text-xs text-muted">
            {format(k.bodyHelp, { slots: slotList(), max: TEMPLATE_BODY_MAX })} {format(k.count, { count: body.trim().length, max: TEMPLATE_BODY_MAX })}
          </p>
        </div>
        {issues.length > 0 && (
          <ul id={`${id}-issues`} role="alert" className="mt-3 list-disc space-y-0.5 pl-5 text-sm font-semibold text-danger">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        <ActionFeedback status="" error={action.error} className="mt-2" />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {k.cancel}
          </Button>
          <Button type="submit" variant="dark" disabled={action.pending}>
            {action.pending && <Spinner />}
            {k.save}
          </Button>
        </div>
      </form>
    </CrmDialog>
  );
}

export function ProspectusCard({
  prospectus,
  canManage,
  pagePath,
  t,
  c,
}: {
  prospectus: { url: string | null; version: number };
  canManage: boolean;
  pagePath: string;
  t: Pick<CrmMessages, "errors">;
  c: CallsMessages;
}) {
  const id = useId();
  const p = c.templates.prospectus;
  const [value, setValue] = useState(prospectus.url ?? "");
  const [issue, setIssue] = useState<string | null>(null);
  const action = useCrmAction(t, pagePath);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prospectusLinkValid(value)) {
      setIssue(format(p.invalid, { max: CONSOLE_URL_MAX }));
      document.getElementById(`${id}-url`)?.focus();
      return;
    }
    setIssue(null);
    const url = value.trim() === "" ? null : value.trim();
    await action.run(callsRequests.saveProspectusLink({ prospectusUrl: url, expectedVersion: prospectus.version }), url ? p.saved : p.removed);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
      <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
        {p.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{format(p.help, { max: CONSOLE_URL_MAX })}</p>
      <p className="mt-3 text-sm">
        <span className="font-semibold text-navy">{p.current}: </span>
        {prospectus.url ? (
          <span lang="en" className="break-all font-mono text-[13px]">
            {prospectus.url}
          </span>
        ) : (
          <span className="text-muted">{p.notSet}</span>
        )}
      </p>
      {canManage && (
        <form onSubmit={submit} noValidate className="mt-4 flex flex-wrap items-end gap-2" aria-busy={action.pending || undefined}>
          <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
            <label htmlFor={`${id}-url`} className={labelClasses}>
              {p.label}
            </label>
            <input
              id={`${id}-url`}
              type="url"
              inputMode="url"
              value={value}
              maxLength={CONSOLE_URL_MAX + 50}
              autoComplete="off"
              lang="en"
              aria-invalid={issue ? true : undefined}
              aria-describedby={issue ? `${id}-issue` : undefined}
              onChange={(event) => setValue(event.target.value)}
              className={fieldClasses}
            />
          </div>
          <Button type="submit" variant="dark" disabled={action.pending}>
            {action.pending && <Spinner />}
            {p.save}
          </Button>
          {issue && (
            <p id={`${id}-issue`} role="alert" className="basis-full text-sm font-semibold text-danger">
              {issue}
            </p>
          )}
          <ActionFeedback status={action.status} error={action.error} className="basis-full" />
        </form>
      )}
    </section>
  );
}
