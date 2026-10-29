"use client";

import { CheckCircle2, ExternalLink, LoaderCircle, MessageCircle, XCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { sendCrm } from "@/components/crm/api";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "@/components/crm/client-kit";
import type { CrmMessages } from "@/components/crm/format";
import { useLocale } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { composerIssues, fillTemplate, leftoverSlots, WA_TEXT_MAX, waMeHref } from "@/lib/crm/console/templates/fill";
import type { FollowUpContextView } from "@/lib/crm/console/followup/types";
import { TEMPLATE_LANGS, type OutcomeResult, type TemplateLang, type WaTemplate } from "@/lib/crm/console/types";
import { callsRequests } from "./api";
import type { CallsMessages } from "./messages";
import { NextFollowUpPicker } from "./NextFollowUpPicker";
import { buildWhatsAppSent, templateRefused, whatsappDefaultPicker, type PickerIssue, type PickerState } from "./outcome-form";
import { useFollowUpContext } from "./use-follow-up-context";
import { clearWaMark, markWaOpened, sessionStore, type WaMark } from "./wa-return";

const card =
  "flex min-h-11 cursor-pointer items-start gap-2 rounded-control border border-line px-3 py-2.5 has-checked:border-blue has-checked:bg-blue-soft";

function Spinner() {
  return <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />;
}

/** "Missed call" for a known key; the key itself for one added later (Phase 2). */
export function templatePurpose(key: string, c: Pick<CallsMessages["whatsapp"], "purposes">): string {
  return c.purposes[key] ?? key;
}

/** "Fill in: test date, batch start" (slot names in the page language). */
export function fillInText(slots: readonly string[], c: Pick<CallsMessages["whatsapp"], "fillIn" | "slots">): string {
  return format(c.fillIn, { slots: slots.map((slot) => c.slots[slot] ?? slot).join(", ") });
}

export type WhatsAppComposerProps = {
  open: boolean;
  leadId: string;
  leadName: string;
  /** The family's number (E.164) — only on the lead page, which already shows it. */
  phone: string;
  pagePath: string;
  t: Pick<CrmMessages, "errors">;
  c: CallsMessages;
  /** Re-open at "Did you send it?" for a stored mark (after a reload or a discarded tab). */
  resume?: WaMark | null;
  /**
   * The "Back from WhatsApp?" prompt already got "Yes, I sent it": open `resume` straight at the
   * next follow-up (the question is not asked twice).
   */
  resumeAnswered?: boolean;
  onClose: () => void;
  /** Finished (logged or not): the parent announces `message` (role="status"). */
  onDone: (message: string) => void;
};

/**
 * WhatsApp composer (docs/admin-phase-1b-plan.md §5.D; owner: 1B-CALLS).
 * Step 1: approved `general` templates (or "Write my own message"), English / Hindi / Hinglish
 * (Hindi when the family's latest form was in Hindi), the text with auto-filled slots, and "Open
 * WhatsApp" — an `aria-disabled` button that says what is missing while any `{slot}` is left or the
 * text is over 1000 characters, else a wa.me link (new tab). Opening WhatsApp LOGS NOTHING: it only
 * stores a mark (wa-return.ts) and moves to step 2.
 * Step 2: "Did you send it?" — Yes reveals the next follow-up and saves `message_sent` with the
 * template; No clears the mark and logs nothing. Opened from the "Back from WhatsApp?" prompt's Yes,
 * it starts at the follow-up (`resumeAnswered`). If the template stopped being approved while
 * WhatsApp was open, the save is refused (422 `contact.template`): the reason is shown and the next
 * save ("Log as my own message") logs it without the template. Aspire's system never sends anything
 * (D-041).
 */
export function WhatsAppComposer({ open, onClose, ...props }: WhatsAppComposerProps) {
  const titleId = `${useId()}-title`;
  return (
    <CrmDialog open={open} titleId={titleId} onClose={onClose} drawer>
      {/* CrmDialog renders its children only while open: every opening loads fresh templates and slots. */}
      <ComposerLoader {...props} titleId={titleId} onClose={onClose} />
    </CrmDialog>
  );
}

function ComposerLoader({
  titleId,
  leadId,
  leadName,
  phone,
  pagePath,
  t,
  c,
  resume = null,
  resumeAnswered = false,
  onClose,
  onDone,
}: Omit<WhatsAppComposerProps, "open"> & { titleId: string }) {
  const locale = useLocale();
  const state = useFollowUpContext(leadId, null, t, pagePath);
  const [templates, setTemplates] = useState<{ status: "loading" | "ready" | "error"; items: WaTemplate[] }>({ status: "loading", items: [] });
  const skipTemplates = resume !== null;

  useEffect(() => {
    if (skipTemplates) return;
    let live = true;
    void sendCrm<WaTemplate[]>(callsRequests.approvedTemplates("general")).then((result) => {
      if (live) setTemplates(result.ok ? { status: "ready", items: result.data } : { status: "error", items: [] });
    });
    return () => {
      live = false;
    };
  }, [skipTemplates]);

  return (
    <>
      {state.status === "ready" ? (
        <ComposerBody
          titleId={titleId}
          ctx={state.ctx}
          templates={templates}
          leadId={leadId}
          leadName={leadName}
          phone={phone}
          pagePath={pagePath}
          t={t}
          c={c}
          locale={locale}
          resume={resume}
          resumeAnswered={resume !== null && resumeAnswered}
          onClose={onClose}
          onDone={onDone}
        />
      ) : (
        <div className="p-5 md:p-6">
          <h2 id={titleId} className="text-lg font-extrabold text-navy">
            {resume ? c.whatsapp.didYouSend : c.whatsapp.title}
            <span className="block text-sm font-semibold text-muted">{leadName}</span>
          </h2>
          {state.status === "error" ? (
            <div className="mt-4">
              <Notice variant="warning" role="alert">
                {state.message || c.calls.loadFailed}
              </Notice>
            </div>
          ) : (
            <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted">
              <Spinner />
              {c.calls.loading}
            </p>
          )}
          <div className="mt-5 flex justify-end">
            <Button variant="outline" onClick={onClose}>
              {c.calls.cancel}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

type ComposerChoice = string | "own";

/** Both steps once the context is loaded (presentational parts are exported for tests). */
function ComposerBody({
  titleId,
  ctx,
  templates,
  leadId,
  leadName,
  phone,
  pagePath,
  t,
  c,
  locale,
  resume,
  resumeAnswered,
  onClose,
  onDone,
}: {
  titleId: string;
  ctx: FollowUpContextView;
  templates: { status: "loading" | "ready" | "error"; items: WaTemplate[] };
  leadId: string;
  leadName: string;
  phone: string;
  pagePath: string;
  t: Pick<CrmMessages, "errors">;
  c: CallsMessages;
  locale: Locale;
  resume: WaMark | null;
  resumeAnswered: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [choice, setChoice] = useState<ComposerChoice | null>(null);
  const [lang, setLang] = useState<TemplateLang>(ctx.defaultLang);
  const [text, setText] = useState("");
  const [sent, setSent] = useState<WaMark | null>(resume);
  // The template stopped being approved while WhatsApp was open: the next save logs "my own message".
  const [templateGone, setTemplateGone] = useState(false);
  const action = useCrmAction(t, pagePath);

  if (sent) {
    const purpose = sent.templateKey ? templatePurpose(sent.templateKey, c.whatsapp) : null;
    return (
      <SentStep
        titleId={titleId}
        ctx={ctx}
        mark={sent}
        leadName={leadName}
        pending={action.pending}
        error={action.error}
        locale={locale}
        c={c}
        initialYes={resumeAnswered && sent === resume}
        templateGone={templateGone}
        onYes={async (picker) => {
          const template = sent.templateKey && !templateGone ? { key: sent.templateKey, lang: sent.lang } : null;
          const built = buildWhatsAppSent(picker, ctx, template);
          if (!built.ok) return built.issue;
          const result = await action.run<OutcomeResult>(callsRequests.recordOutcome(leadId, built.input), undefined, (failure) => {
            if (!template || !templateRefused(failure)) return null;
            setTemplateGone(true);
            return format(c.whatsapp.templateGone, { template: purpose ?? template.key });
          });
          if (result === null) return null;
          clearWaMark(sessionStore());
          onDone(template && purpose ? format(c.whatsapp.loggedTemplate, { template: purpose }) : c.whatsapp.loggedOwn);
          return null;
        }}
        onNo={() => {
          clearWaMark(sessionStore());
          onDone(c.whatsapp.nothingLogged);
        }}
      />
    );
  }

  const selectTemplate = (next: ComposerChoice, nextLang: TemplateLang) => {
    setChoice(next);
    setLang(nextLang);
    const template = templates.items.find((item) => item.key === next);
    setText(template ? fillTemplate(template.bodies[nextLang], ctx.slotsByLang[nextLang]) : next === "own" ? "" : text);
  };

  return (
    <ComposeStep
      titleId={titleId}
      templates={templates}
      choice={choice}
      lang={lang}
      text={text}
      phone={phone}
      leadName={leadName}
      c={c}
      onChoose={(next) => selectTemplate(next, lang)}
      onLang={(next) => (choice && choice !== "own" ? selectTemplate(choice, next) : setLang(next))}
      onText={setText}
      onOpened={() => {
        const mark: WaMark = { leadId, templateKey: choice && choice !== "own" ? choice : null, lang, openedAt: Date.now() };
        markWaOpened(sessionStore(), mark);
        setSent(mark);
      }}
      onCancel={onClose}
    />
  );
}

/** Step 1 (static markup in tests). */
export function ComposeStep({
  titleId,
  templates,
  choice,
  lang,
  text,
  phone,
  leadName,
  c,
  onChoose,
  onLang,
  onText,
  onOpened,
  onCancel,
}: {
  titleId: string;
  templates: { status: "loading" | "ready" | "error"; items: WaTemplate[] };
  choice: ComposerChoice | null;
  lang: TemplateLang;
  text: string;
  phone: string;
  leadName: string;
  c: CallsMessages;
  onChoose: (choice: ComposerChoice) => void;
  onLang: (lang: TemplateLang) => void;
  onText: (text: string) => void;
  onOpened: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const w = c.whatsapp;
  const issues = composerIssues(text);
  const href = issues.length === 0 ? waMeHref(phone, text) : null;
  const reasons = [
    issues.includes("empty") ? w.empty : null,
    issues.includes("slots") ? fillInText(leftoverSlots(text), w) : null,
    issues.includes("tooLong") ? format(w.tooLong, { max: WA_TEXT_MAX, count: text.length }) : null,
  ].filter((reason): reason is string => reason !== null);

  return (
    <div className="p-5 md:p-6">
      <h2 id={titleId} className="text-lg font-extrabold text-navy">
        {w.title}
        <span className="block text-base font-bold text-ink">{leadName}</span>
      </h2>
      <p className="mt-2 text-sm text-muted">{w.intro}</p>

      <fieldset className="mt-4">
        <legend className={labelClasses}>{w.templates}</legend>
        {templates.status === "loading" && (
          <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Spinner />
            {w.loading}
          </p>
        )}
        {templates.status === "error" && <p className="mt-2 text-sm text-muted">{w.loadFailed}</p>}
        {templates.status === "ready" && templates.items.length === 0 && <p className="mt-2 text-sm text-muted">{w.noApproved}</p>}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {templates.items.map((template) => (
            <label key={template.key} className={card}>
              <input type="radio" name={`${id}-template`} value={template.key} checked={choice === template.key} onChange={() => onChoose(template.key)} className="mt-0.5 size-4 shrink-0 accent-[#1768d4]" />
              <span className="text-sm font-semibold">{templatePurpose(template.key, w)}</span>
            </label>
          ))}
          <label className={card}>
            <input type="radio" name={`${id}-template`} value="own" checked={choice === "own"} onChange={() => onChoose("own")} className="mt-0.5 size-4 shrink-0 accent-[#1768d4]" />
            <span className="text-sm">
              <span className="font-semibold">{w.own}</span>
              <span className="block text-muted">{w.ownHint}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className={labelClasses}>{w.language}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEMPLATE_LANGS.map((value) => (
            <label key={value} className={cn(card, "items-center")}>
              <input type="radio" name={`${id}-lang`} value={value} checked={lang === value} onChange={() => onLang(value)} className="size-4 accent-[#1768d4]" />
              <span className="text-sm font-semibold" lang={value === "hi" ? "hi" : "en"}>
                {w.langs[value]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor={`${id}-text`} className={labelClasses}>
          {w.text}
        </label>
        <textarea
          id={`${id}-text`}
          value={text}
          rows={7}
          lang={lang === "hi" ? "hi" : "en"}
          aria-describedby={`${id}-text-hint ${id}-reasons`}
          onChange={(event) => onText(event.target.value)}
          className={cn(fieldClasses, "min-h-40")}
        />
        <p id={`${id}-text-hint`} className="text-xs text-muted">
          {w.textHint} {format(c.templates.count, { count: text.length, max: WA_TEXT_MAX })}
        </p>
      </div>

      <div id={`${id}-reasons`} className="mt-3">
        {reasons.length > 0 && (
          <div className="text-sm">
            <p className="font-semibold text-navy">{w.notReady}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {c.calls.cancel}
        </Button>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onOpened}
            aria-label={w.openWhatsAppLabel}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-[#0f5a3c] px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
          >
            <MessageCircle aria-hidden="true" className="size-4" />
            {w.openWhatsApp}
            <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        ) : (
          <button
            type="button"
            aria-disabled="true"
            aria-describedby={`${id}-reasons`}
            className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-control border border-dashed border-[#b9cbe0] bg-[#f4f7fb] px-4 py-2.5 text-sm font-bold text-[#5a6a7f]"
          >
            <MessageCircle aria-hidden="true" className="size-4" />
            {w.openWhatsApp}
          </button>
        )}
      </div>
    </div>
  );
}

/** Step 2: "Did you send it?" (static markup in tests). `onYes` returns a picker issue to show, or null. */
export function SentStep({
  titleId,
  ctx,
  mark,
  leadName,
  pending,
  error,
  locale,
  c,
  onYes,
  onNo,
  initialYes = false,
  templateGone = false,
}: {
  titleId: string;
  ctx: FollowUpContextView;
  mark: WaMark;
  leadName: string;
  pending: boolean;
  error: string | null;
  locale: Locale;
  c: CallsMessages;
  onYes: (picker: PickerState) => Promise<PickerIssue | null>;
  onNo: () => void;
  /** "Yes" already chosen (the "Back from WhatsApp?" prompt got it; tests). */
  initialYes?: boolean;
  /** The template is no longer approved: saving logs the message as the staff member's own. */
  templateGone?: boolean;
}) {
  const id = useId();
  const w = c.whatsapp;
  const [yes, setYes] = useState(initialYes);
  const [picker, setPicker] = useState<PickerState>(whatsappDefaultPicker(ctx));
  const [showIssue, setShowIssue] = useState(false);

  return (
    <div className="p-5 md:p-6">
      <h2 id={titleId} className="text-lg font-extrabold text-navy">
        {w.didYouSend}
        <span className="block text-base font-bold text-ink">{leadName}</span>
      </h2>
      <p className="mt-2 text-sm text-muted">{w.didYouSendBody}</p>
      {mark.templateKey && <p className="mt-1 text-sm font-semibold text-ink">{templatePurpose(mark.templateKey, w)}</p>}
      {!yes ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="dark" onClick={() => setYes(true)}>
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {w.yesSent}
          </Button>
          <Button variant="outline" onClick={onNo}>
            <XCircle aria-hidden="true" className="size-4" />
            {w.notSent}
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className="mt-4"
          aria-busy={pending || undefined}
          onSubmit={async (event) => {
            event.preventDefault();
            const issue = await onYes(picker);
            setShowIssue(issue !== null);
          }}
        >
          <NextFollowUpPicker idBase={id} ctx={ctx} state={picker} onChange={setPicker} suggestion={null} showIssue={showIssue} locale={locale} c={c.calls} />
          <ActionFeedback status="" error={error} className="mt-3" />
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onNo}>
              {w.notSent}
            </Button>
            <Button type="submit" variant="dark" disabled={pending}>
              {pending && <Spinner />}
              {templateGone ? w.logAsOwn : c.calls.save}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
