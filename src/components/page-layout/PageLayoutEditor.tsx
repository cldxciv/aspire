"use client";

import { ExternalLink, Eye, LoaderCircle, RotateCcw, Save, Send, Trash2, Undo2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button, buttonClasses, Notice } from "@/components/ui";
import { inputClasses } from "@/components/auth/fields";
import { htmlLang, type Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import {
  LAYOUT_PAGE_KEYS,
  LAYOUT_PAGES,
  PAGE_LAYOUT_PREVIEW_PATH,
  isLayoutPageKey,
  type LayoutPageKey,
} from "@/lib/page-layout/registry";
import type { LayoutAction, PageLayoutStateView, StoredEntry } from "@/lib/page-layout/types";

import { fetchLayoutState, writeLayout, type LayoutApiResult } from "./editor-api";
import {
  apiIssueText,
  canReset,
  currentIssueTexts,
  isDirty,
  moveBlock,
  moveEntries,
  movedAnnouncement,
  pickerState,
  reasonText,
  savedEntries,
  toggleBlock,
  toggleEntries,
  toggledAnnouncement,
  type MoveDirection,
} from "./editor-model";
import { fill, pageName, type LayoutMessages } from "./labels";
import { LayoutHistoryList } from "./LayoutHistoryList";
import { LayoutSectionList } from "./LayoutSectionList";

/**
 * Admin "Page layout" editor (docs/page-layout-plan.md §10, D3–D5, D14). Pick a page, move its
 * sections up or down, show or hide them, save a draft, preview it on the real page (new tab,
 * Draft Mode), publish it, discard it or reset the page to its original order. Only super admins
 * edit (`canEdit`); other admins see the live order and the history. The server re-checks every
 * write; this screen only mirrors the rules so blocked controls can explain themselves.
 */

export type PageLayoutEditorProps = {
  canEdit: boolean;
  /** Data-free preview of the console (no session): shows the default order of every page. */
  previewAccess?: boolean;
  states: Record<LayoutPageKey, PageLayoutStateView>;
  initialPage: LayoutPageKey;
  locale: Locale;
  t: LayoutMessages;
};

type Confirming = "publish" | "discard" | "reset";
type Failure = { text: string; conflict: boolean };
type Busy = LayoutAction | "reload" | null;

const CONFIRM_ACTION: Record<Confirming, LayoutAction> = { publish: "publish", discard: "discard_draft", reset: "reset" };

/** Blocked look for the shared Button (it styles `disabled`, which blocked controls never use, D14). */
const BLOCKED = "aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:translate-y-0";

export function PageLayoutEditor({ canEdit, previewAccess = false, states: initialStates, initialPage, locale, t }: PageLayoutEditorProps) {
  const [states, setStates] = useState(initialStates);
  const [local, setLocal] = useState<Partial<Record<LayoutPageKey, StoredEntry[]>>>({});
  const [page, setPage] = useState<LayoutPageKey>(initialPage);
  const [busy, setBusy] = useState<Busy>(null);
  const [announcement, setAnnouncement] = useState("");
  const [done, setDone] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [apiIssues, setApiIssues] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ids = {
    select: `${uid}-page`,
    hint: `${uid}-page-hint`,
    list: `${uid}-list`,
    history: `${uid}-history`,
    confirm: `${uid}-confirm-title`,
    reason: (name: string) => `${uid}-action-${name}-reason`,
  };

  const controls = useRef(new Map<string, HTMLElement>());
  const focusNext = useRef<string | null>(null);
  const registerControl = useCallback((name: string, element: HTMLElement | null) => {
    if (element) controls.current.set(name, element);
    else controls.current.delete(name);
  }, []);

  // Restore focus after a re-render (React moves the row's node on "Move down", which drops focus).
  useLayoutEffect(() => {
    const name = focusNext.current;
    if (!name) return;
    focusNext.current = null;
    (controls.current.get(name) ?? controls.current.get("select"))?.focus();
  });

  const state = states[page];
  const saved = savedEntries(state);
  const entries = canEdit ? (local[page] ?? saved) : state.published.sections;
  const dirty = canEdit && isDirty(state, local[page]);
  const anyDirty = canEdit && LAYOUT_PAGE_KEYS.some((key) => isDirty(states[key], local[key]));

  useEffect(() => {
    if (!anyDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(htmlLang[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }),
    [locale],
  );
  const formatDate = useCallback((ms: number) => dateFormat.format(new Date(ms)), [dateFormat]);
  const nameOr = (name: string | null) => name ?? t.history.someone;

  /** Polite announcement; repeating the same text still re-announces it. */
  const announce = (text: string) => setAnnouncement((previous) => (previous === text ? `${text} ` : text));

  function choosePage(value: string) {
    if (!isLayoutPageKey(value)) return;
    setPage(value);
    setFailure(null);
    setApiIssues([]);
    setConfirming(null);
    setDone("");
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("page", value);
      window.history.replaceState(null, "", url);
    } catch {
      // The address bar is a convenience only.
    }
  }

  function setLocalEntries(next: StoredEntry[] | undefined) {
    setLocal((previous) => {
      const copy = { ...previous };
      if (next) copy[page] = next;
      else delete copy[page];
      return copy;
    });
  }

  function move(index: number, direction: MoveDirection) {
    const entry = entries[index];
    if (!entry || busy) return;
    const block = moveBlock(page, entries, index, direction);
    if (block) {
      announce(reasonText(t, page, block));
      return;
    }
    focusNext.current = `${entry.key}:${direction}`;
    setLocalEntries(moveEntries(entries, index, direction));
    setApiIssues([]);
    setDone("");
    announce(movedAnnouncement(t, page, entry.key, direction === "up" ? index - 1 : index + 1));
  }

  function toggle(index: number) {
    const entry = entries[index];
    if (!entry || busy) return;
    const block = toggleBlock(page, entries, index);
    if (block) {
      announce(reasonText(t, page, block));
      return;
    }
    setLocalEntries(toggleEntries(entries, index));
    setApiIssues([]);
    setDone("");
    announce(toggledAnnouncement(t, page, entry.key, !entry.hidden));
  }

  function showFailure(result: Exclude<LayoutApiResult, { ok: true }>) {
    if (result.kind === "invalid") {
      setApiIssues([...new Set(result.issues.map((code) => apiIssueText(t, page, code)))]);
      setFailure({ text: t.errors.validation, conflict: false });
      return;
    }
    const text = {
      conflict: t.errors.conflict,
      signedOut: t.errors.signedOut,
      forbidden: t.errors.forbidden,
      rateLimited: t.errors.rateLimited,
      network: t.errors.network,
      generic: t.errors.generic,
    }[result.kind];
    setFailure({ text, conflict: result.kind === "conflict" });
  }

  const doneText: Record<LayoutAction, string> = {
    save_draft: t.done.saved,
    publish: fill(t.done.published, { page: pageName(t, page) }),
    discard_draft: t.done.discarded,
    reset: t.done.reset,
  };

  async function run(action: LayoutAction, trigger: string) {
    if (busy) return;
    setBusy(action);
    setFailure(null);
    setApiIssues([]);
    setDone("");
    const target = page;
    const result = await writeLayout(
      target,
      action === "save_draft"
        ? { action, revision: state.revision, sections: entries.map(({ key, hidden }) => ({ key, hidden })) }
        : { action, revision: state.revision },
    );
    setBusy(null);
    setConfirming(null);
    focusNext.current = trigger;
    if (!result.ok) {
      showFailure(result);
      return;
    }
    setStates((previous) => ({ ...previous, [target]: result.state }));
    setLocal((previous) => {
      const copy = { ...previous };
      delete copy[target];
      return copy;
    });
    setDone(doneText[action]);
  }

  async function reload() {
    if (busy) return;
    setBusy("reload");
    const target = page;
    const result = await fetchLayoutState(target);
    setBusy(null);
    if (!result.ok) {
      showFailure(result);
      return;
    }
    setStates((previous) => ({ ...previous, [target]: result.state }));
    setLocal((previous) => {
      const copy = { ...previous };
      delete copy[target];
      return copy;
    });
    setFailure(null);
    setApiIssues([]);
    focusNext.current = "select";
  }

  function openConfirm(kind: Confirming) {
    if (busy) return;
    setConfirming(kind);
    focusNext.current = "confirm";
  }

  function closeConfirm() {
    const kind = confirming;
    setConfirming(null);
    if (kind) focusNext.current = `action:${kind}`;
  }

  const issueTexts = canEdit ? [...new Set([...apiIssues, ...currentIssueTexts(t, page, entries)])] : [];

  // Blocked action reasons (D14).
  const saveBlock = !dirty ? t.actions.saveNothing : currentIssueTexts(t, page, entries)[0] ?? null;
  const previewBlock = dirty ? t.actions.previewNeedsSave : !state.draft ? t.actions.previewNoDraft : null;
  const publishBlock = !state.draft ? t.actions.publishNeedsDraft : dirty ? t.actions.publishNeedsSave : null;
  const resetBlock = canReset(state) ? null : t.actions.resetNothing;

  /** Event-time guard for a blocked control: announce its reason instead of acting (D14). */
  function attempt(block: string | null, action: () => void) {
    if (block) {
      announce(block);
      return;
    }
    action();
  }

  function onPreviewSubmit(event: FormEvent<HTMLFormElement>) {
    if (previewBlock || busy) {
      event.preventDefault();
      if (previewBlock) announce(previewBlock);
    }
  }

  const livePath = localePath(LAYOUT_PAGES[page].path, locale);
  const draft = state.draft;
  const published = state.published;

  return (
    <div className="space-y-6">
      {!canEdit && (
        <Notice variant="info" title={previewAccess ? undefined : t.readOnly.title}>
          {previewAccess ? t.previewAccess : t.readOnly.body}
        </Notice>
      )}

      <section className="rounded-card border border-line bg-white p-5 shadow-soft md:p-6">
        <div className="grid gap-5 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:items-start">
          <div>
            <label htmlFor={ids.select} className="block text-sm font-bold text-navy">
              {t.picker.label}
            </label>
            <select
              id={ids.select}
              ref={(element) => registerControl("select", element)}
              value={page}
              aria-describedby={ids.hint}
              onChange={(event) => choosePage(event.target.value)}
              className={cn(inputClasses, "mt-1.5 border-[#b9cbe0]")}
            >
              {LAYOUT_PAGE_KEYS.map((key) => {
                const marker = canEdit ? pickerState(states[key], local[key]) : pickerState(states[key], undefined);
                return (
                  <option key={key} value={key}>
                    {marker ? `${pageName(t, key)} — ${t.picker[marker]}` : pageName(t, key)}
                  </option>
                );
              })}
            </select>
            <p id={ids.hint} className="mt-1.5 text-sm text-muted">
              {t.picker.hint}
            </p>
          </div>
          <div className="space-y-1.5 text-sm text-ink">
            <p suppressHydrationWarning>
              {published.custom && published.updatedAt !== null
                ? fill(t.status.liveCustom, { date: formatDate(published.updatedAt), name: nameOr(published.updatedBy) })
                : t.status.liveDefault}
            </p>
            <p suppressHydrationWarning>
              {draft ? fill(t.status.draft, { date: formatDate(draft.updatedAt), name: nameOr(draft.updatedBy) }) : t.status.noDraft}
            </p>
            {dirty && <p className="font-bold text-[#7a5600]">{t.status.unsaved}</p>}
            <p>
              <a
                href={livePath}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center gap-1.5 font-bold text-blue underline underline-offset-4 hover:text-navy"
              >
                {t.viewLive}
                <ExternalLink aria-hidden="true" className="size-4" />
                <span className="sr-only"> {t.newTab}</span>
              </a>
            </p>
          </div>
        </div>
        {page === "hostels" && (
          <Notice variant="info" className="mt-4">
            {t.pages.hostels.note}
          </Notice>
        )}
      </section>

      <section aria-labelledby={ids.list} className="space-y-3">
        <h2 id={ids.list} className="text-lg font-extrabold text-navy">
          {t.list.heading}
        </h2>
        <LayoutSectionList
          page={page}
          entries={entries}
          canEdit={canEdit}
          t={t}
          idPrefix={`${uid}-row`}
          headingId={ids.list}
          onMove={move}
          onToggle={toggle}
          registerControl={registerControl}
        />
      </section>

      {canEdit && (
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      )}

      {issueTexts.length > 0 && (
        <div role="alert" className="rounded-control border border-[#f5c2bd] bg-danger-soft p-3 text-sm text-danger">
          <ul className="list-disc space-y-1 ps-5">
            {issueTexts.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <ActionItem reasonId={ids.reason("save")} reason={saveBlock}>
              <Button
                ref={(element) => registerControl("action:save", element)}
                variant={dirty ? "primary" : "outline"}
                className={BLOCKED}
                aria-disabled={saveBlock || busy ? "true" : undefined}
                aria-describedby={saveBlock ? ids.reason("save") : undefined}
                onClick={() => attempt(saveBlock, () => void run("save_draft", "action:save"))}
              >
                {busy === "save_draft" ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Save aria-hidden="true" className="size-4" />
                )}
                {busy === "save_draft" ? t.actions.saving : t.actions.save}
              </Button>
            </ActionItem>

            {dirty && (
              <ActionItem>
                <Button
                  ref={(element) => registerControl("action:undo", element)}
                  variant="outline"
                  onClick={() => {
                    if (busy) return;
                    setLocalEntries(undefined);
                    setApiIssues([]);
                    focusNext.current = "action:save";
                  }}
                >
                  <Undo2 aria-hidden="true" className="size-4" />
                  {t.actions.undo}
                </Button>
              </ActionItem>
            )}

            <ActionItem reasonId={ids.reason("preview")} reason={previewBlock}>
              <form method="post" action={PAGE_LAYOUT_PREVIEW_PATH} target="_blank" onSubmit={onPreviewSubmit}>
                <input type="hidden" name="page" value={page} />
                <input type="hidden" name="lang" value={locale} />
                <button
                  type="submit"
                  ref={(element) => registerControl("action:preview", element)}
                  className={buttonClasses({ variant: "outline", className: BLOCKED })}
                  aria-disabled={previewBlock ? "true" : undefined}
                  aria-describedby={previewBlock ? ids.reason("preview") : undefined}
                >
                  <Eye aria-hidden="true" className="size-4" />
                  {t.actions.preview}
                  <span className="sr-only"> {t.newTab}</span>
                </button>
              </form>
            </ActionItem>

            <ActionItem reasonId={ids.reason("publish")} reason={publishBlock}>
              <Button
                ref={(element) => registerControl("action:publish", element)}
                variant={!publishBlock ? "dark" : "outline"}
                className={BLOCKED}
                aria-disabled={publishBlock || busy ? "true" : undefined}
                aria-describedby={publishBlock ? ids.reason("publish") : undefined}
                aria-expanded={confirming === "publish"}
                onClick={() => attempt(publishBlock, () => openConfirm("publish"))}
              >
                <Send aria-hidden="true" className="size-4" />
                {t.actions.publish}
              </Button>
            </ActionItem>

            {draft && (
              <ActionItem>
                <Button
                  ref={(element) => registerControl("action:discard", element)}
                  variant="outline"
                  className={BLOCKED}
                  aria-disabled={busy ? "true" : undefined}
                  aria-expanded={confirming === "discard"}
                  onClick={() => openConfirm("discard")}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  {t.actions.discard}
                </Button>
              </ActionItem>
            )}

            <ActionItem reasonId={ids.reason("reset")} reason={resetBlock}>
              <Button
                ref={(element) => registerControl("action:reset", element)}
                variant="outline"
                className={BLOCKED}
                aria-disabled={resetBlock || busy ? "true" : undefined}
                aria-describedby={resetBlock ? ids.reason("reset") : undefined}
                aria-expanded={confirming === "reset"}
                onClick={() => attempt(resetBlock, () => openConfirm("reset"))}
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                {t.actions.reset}
              </Button>
            </ActionItem>
          </div>

          {confirming && (
            <ConfirmRegion
              titleId={ids.confirm}
              title={{ publish: t.actions.publishTitle, discard: t.actions.discardTitle, reset: t.actions.resetTitle }[confirming]}
              body={
                {
                  publish: fill(t.actions.publishBody, { page: pageName(t, page) }),
                  discard: t.actions.discardBody,
                  reset: t.actions.resetBody,
                }[confirming]
              }
              confirmLabel={{ publish: t.actions.publishNow, discard: t.actions.discardNow, reset: t.actions.resetNow }[confirming]}
              cancelLabel={t.actions.cancel}
              busy={busy !== null}
              registerControl={registerControl}
              onConfirm={() => void run(CONFIRM_ACTION[confirming], `action:${confirming}`)}
              onCancel={closeConfirm}
            />
          )}

          {failure && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-control border border-[#f5c2bd] bg-danger-soft p-3 text-sm text-danger">
              <p className="min-w-0 flex-1 basis-64">{failure.text}</p>
              {failure.conflict && (
                <Button variant="outline" size="md" onClick={() => void reload()}>
                  {t.actions.reload}
                </Button>
              )}
            </div>
          )}

          <p role="status" className={cn("text-sm font-semibold text-[#0f5a3c]", !done && "sr-only")}>
            {done}
          </p>
        </div>
      )}

      <LayoutHistoryList page={page} history={state.history} t={t} formatDate={formatDate} headingId={ids.history} />
    </div>
  );
}

/** One action button with its blocked reason (visible, linked with aria-describedby). */
function ActionItem({ reasonId, reason, children }: { reasonId?: string; reason?: string | null; children: ReactNode }) {
  return (
    <div className="flex max-w-[16rem] flex-col gap-1">
      {children}
      {reason && reasonId && (
        <p id={reasonId} className="text-xs text-muted">
          {reason}
        </p>
      )}
    </div>
  );
}

function ConfirmRegion({
  titleId,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy,
  registerControl,
  onConfirm,
  onCancel,
}: {
  titleId: string;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  registerControl: (name: string, element: HTMLElement | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="rounded-card border border-[#f2dfa0] border-l-[6px] border-l-gold bg-gold-soft p-4 text-ink"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <p id={titleId} className="font-extrabold text-navy">
        {title}
      </p>
      <p className="mt-1 text-sm">{body}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          ref={(element) => registerControl("confirm", element)}
          variant="dark"
          className={BLOCKED}
          aria-disabled={busy ? "true" : undefined}
          onClick={() => {
            if (!busy) onConfirm();
          }}
        >
          {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
          {confirmLabel}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
