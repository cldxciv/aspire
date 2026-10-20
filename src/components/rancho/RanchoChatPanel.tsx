"use client";

import { Camera, LoaderCircle, RotateCcw, Send, Square, X } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";

import { AnswerContent } from "@/components/ask/AnswerContent";
import { hoursFromSeconds, type AskFailure } from "@/components/ask/ask-client";
import { withEnquiryTool } from "@/components/forms/enquiry-context";
import { Notice } from "@/components/ui/Feedback";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { ASK_MAX_QUESTION_CHARS, ASK_SUBJECT_HINTS, type AskStatus, type AskSubjectHint } from "@/lib/ask/constants";
import { cn } from "@/lib/cn";

import { RanchoMascot } from "./RanchoMascot";
import { RanchoPhotoAttachment } from "./RanchoPhotoAttachment";
import { askRancho, fetchAskStatus, RANCHO_DESKTOP_QUERY, validateQuestion, type RanchoStop } from "./rancho-chat";
import {
  createPreviewUrls,
  loadRanchoPhoto,
  photoByteLimit,
  RANCHO_PHOTO_ACCEPT,
  type RanchoPhoto,
  type RanchoPhotoProblem,
} from "./rancho-photo";

export type RanchoPanelMessages = Messages<"rancho">["panel"];

export interface RanchoLinks {
  /** The full Rancho page (/tools/ask). */
  ask: string;
  /** The admissions enquiry form (`?from=ask` is added here). */
  enquiry: string;
  privacy: string;
  signIn: string;
}

interface Turn {
  id: number;
  /** Empty for a photo-only question. */
  question: string;
  /** Preview object URL of the photo sent with this question (revoked on "New chat" / unmount). */
  photoUrl: string | null;
  subject: AskSubjectHint;
  answer: string;
  phase: "waiting" | "streaming" | "done";
  stop: RanchoStop | null;
  failure: AskFailure | null;
}

function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(RANCHO_DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Failure → copy shown in Rancho's bubble (not_configured and limit get their own notices). */
function failureText(failure: AskFailure | null, t: RanchoPanelMessages): string | null {
  if (!failure) return null;
  switch (failure.kind) {
    case "not_configured":
    case "limit":
      return null;
    case "busy":
      return t.errors.busy;
    case "network":
      return t.errors.network;
    case "interrupted":
      return t.errors.interrupted;
    case "blocked":
      return t.errors.blocked;
    case "too_large":
      return t.photo.errors.tooLarge;
    case "invalid_image":
      return t.photo.errors.rejected;
    case "validation":
      return failure.field === "photoConsent" ? t.photo.errors.consentRequired : t.errors.questionRequired;
    default:
      return t.errors.generic;
  }
}

function photoProblemText(problem: RanchoPhotoProblem, t: RanchoPanelMessages["photo"]): string {
  if (problem === "unsupported") return t.errors.unsupported;
  return problem === "too_large" ? t.errors.tooLarge : t.errors.unreadable;
}

/**
 * Compact text chat with Rancho (the floating launcher's panel; lazy-loaded on first open).
 *
 * - A native `<dialog>`: `showModal()` on phones (full-height sheet, focus contained, page inert and
 *   not scrollable), `show()` from 640px (non-modal popover above the launcher). Esc and the close
 *   button close it; focus then returns to the launcher. Entry motion only without reduced motion.
 * - Same backend as the Ask page (`/api/ask`): a typed question, a photo of one, or both. The photo
 *   is prepared on the device with the Ask page's `preparePhoto` (scaled down, re-encoded, location
 *   removed) and needs the "no faces or names" box ticked, as the API requires (rancho-photo.ts).
 * - The conversation (photos included, as object URLs) is React state only (no storage) and
 *   survives closing the panel while browsing the public site; "New chat" clears it and revokes the
 *   URLs. So does the panel going away: unmounted (on the Ask page) or hidden by Next's `<Activity>`
 *   (Cache Components keep a left route's state, e.g. after moving on to the portal). Closing the
 *   panel stops an answer that is still streaming.
 */
export function RanchoChatPanel({
  id,
  open,
  onClose,
  returnFocusRef,
  messages: t,
  locale,
  links,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  /** Gets focus back when the panel closes (the launcher button). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  messages: RanchoPanelMessages;
  locale: Locale;
  links: RanchoLinks;
}) {
  const uid = useId();
  const ids = {
    heading: `${uid}-heading`,
    question: `${uid}-question`,
    hint: `${uid}-hint`,
    error: `${uid}-error`,
    privacy: `${uid}-privacy`,
    photoError: `${uid}-photo-error`,
    consent: `${uid}-consent`,
    consentError: `${uid}-consent-error`,
    photoNote: `${uid}-photo-note`,
  };

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const nextTurnId = useRef(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoButtonRef = useRef<HTMLButtonElement | null>(null);
  const consentRef = useRef<HTMLInputElement | null>(null);
  /** The composer's photo, readable after an `await` (mirrors `photo`). */
  const photoRef = useRef<RanchoPhoto | null>(null);
  /** Bumped by each pick and by "New chat", so a superseded photo is dropped when it is ready. */
  const pickRef = useRef(0);
  /** Bumped by "New chat": a question still in flight from the old chat is then ignored. */
  const chatRef = useRef(0);
  const mountedRef = useRef(false);

  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(RANCHO_DESKTOP_QUERY).matches,
    () => false,
  );
  const modal = !desktop;

  const [status, setStatus] = useState<AskStatus | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [subject, setSubject] = useState<AskSubjectHint>("auto");
  const [fieldError, setFieldError] = useState<{ field: "question" | "consent"; message: string } | null>(null);
  const [photo, setPhoto] = useState<RanchoPhoto | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [previewUrls] = useState(() => createPreviewUrls());
  const [notConfigured, setNotConfigured] = useState(false);
  const [limitFailure, setLimitFailure] = useState<AskFailure | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const busy = turns.some((turn) => turn.phase !== "done");
  const notConnected = notConfigured || status?.configured === false;
  const outOfQuestions = Boolean(limitFailure) || (status !== null && status.configured && status.remaining <= 0);
  const blocked = notConnected || outOfQuestions;

  // Open / close the native dialog (modal on phones), and switch mode if the viewport crosses 640px.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      abortRef.current?.abort();
      if (dialog.open) {
        dialog.close();
        returnFocusRef?.current?.focus();
      }
      return;
    }
    if (dialog.open) dialog.close();
    if (modal) dialog.showModal();
    else dialog.show();
    const field = textareaRef.current;
    (field && !field.disabled ? field : headingRef.current)?.focus();
  }, [open, modal, returnFocusRef]);

  // The page behind the phone sheet doesn't scroll.
  useEffect(() => {
    if (!open || !modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, modal]);

  // Connection + allowance, refreshed each time the panel opens.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetchAskStatus(controller.signal).then((next) => {
      if (next) setStatus(next);
    });
    return () => controller.abort();
  }, [open]);

  // If the input gets disabled while it has focus (not connected / out of questions), keep focus in the panel.
  useEffect(() => {
    if (!blocked || !open) return;
    const active = document.activeElement;
    if (!active || active === document.body || active === textareaRef.current) headingRef.current?.focus();
  }, [blocked, open]);

  // Follow the answer while it streams, unless the student scrolled up to read.
  useEffect(() => {
    const log = logRef.current;
    if (log && stickToBottom.current) log.scrollTop = log.scrollHeight;
  }, [turns, notConnected, outOfQuestions]);

  // When the panel goes away: unmounted (e.g. on the Ask page itself) or hidden by Next's <Activity>
  // (with Cache Components a route that is left keeps its state, and its effects are cleaned up;
  // RanchoDock sits in the (site) layout, so moving on to a (portal) page hides it). Either way: stop
  // a streaming answer, close the dialog (a hidden modal would leave the next page inert), free the
  // photos and start a fresh chat, so nothing is left pointing at a revoked photo URL or waiting for
  // an answer that was stopped. A passive effect on purpose: a layout effect's cleanup would also
  // run whenever a Suspense boundary above re-showed its fallback, which shouldn't wipe the chat.
  useEffect(() => {
    mountedRef.current = true;
    const abort = abortRef;
    const dialog = dialogRef.current;
    return () => {
      mountedRef.current = false;
      abort.current?.abort();
      abort.current = null;
      if (dialog?.open) dialog.close();
      pickRef.current += 1; // a photo still being prepared is dropped
      chatRef.current += 1; // a question still in flight is ignored
      previewUrls.releaseAll();
      photoRef.current = null;
      setPhoto(null);
      setPhotoConsent(false);
      setPreparing(false);
      setPhotoError(null);
      setTurns([]);
      setQuestion("");
      setFieldError(null);
      setAnnouncement("");
    };
  }, [previewUrls]);

  function onLogScroll() {
    const log = logRef.current;
    if (log) stickToBottom.current = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
  }

  /** Swaps the composer's photo; the preview URL of the one it replaces is released. */
  function setComposerPhoto(next: RanchoPhoto | null, consent = false) {
    const previous = photoRef.current;
    if (next) previewUrls.hold(next.previewUrl);
    if (previous) previewUrls.release(previous.previewUrl);
    photoRef.current = next;
    setPhoto(next);
    setPhotoConsent(consent);
    setFieldError((current) => (current?.field === "consent" ? null : current));
  }

  async function onPhotoChosen(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = ""; // so choosing the same file again still fires `change`
    if (!file) return;
    const pick = ++pickRef.current;
    setPreparing(true);
    setPhotoError(null);
    setAnnouncement(t.photo.preparing);
    const result = await loadRanchoPhoto(file, { maxBytes: photoByteLimit(status) });
    if (pick !== pickRef.current || !mountedRef.current) {
      // Superseded ("New chat") or the panel went away while it was being prepared.
      if (result.ok) URL.revokeObjectURL(result.photo.previewUrl);
      return;
    }
    setPreparing(false);
    if (!result.ok) {
      setPhotoError(photoProblemText(result.problem, t.photo));
      setAnnouncement("");
      return;
    }
    setComposerPhoto(result.photo);
    setFieldError(null);
    // Focus stays on the camera button; the required box sits above it, so say so.
    setAnnouncement(t.photo.attachedAnnouncement);
  }

  function choosePhoto() {
    if (!preparing) fileInputRef.current?.click();
  }

  function removePhoto() {
    setComposerPhoto(null);
    setPhotoError(null);
    setAnnouncement(t.photo.removed);
    photoButtonRef.current?.focus();
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy || blocked) return;
    if (preparing) {
      // Send is aria-disabled meanwhile; say why nothing was sent.
      setAnnouncement(t.photo.wait);
      return;
    }
    const attached = photoRef.current;
    const problem = validateQuestion(question, attached ? { consent: photoConsent } : null);
    if (problem === "consent_required") {
      setFieldError({ field: "consent", message: t.photo.errors.consentRequired });
      consentRef.current?.focus();
      return;
    }
    if (problem) {
      setFieldError({
        field: "question",
        message: problem === "required" ? t.errors.questionRequired : format(t.errors.questionTooLong, { max: ASK_MAX_QUESTION_CHARS }),
      });
      textareaRef.current?.focus();
      return;
    }
    setFieldError(null);
    setPhotoError(null);

    const asked = question.trim();
    const consented = photoConsent;
    const chat = chatRef.current;
    const turnId = nextTurnId.current++;
    const controller = new AbortController();
    abortRef.current = controller;
    stickToBottom.current = true;
    // The sent message keeps showing the photo; the composer lets go of it.
    if (attached) previewUrls.hold(attached.previewUrl);
    setTurns((list) => [
      ...list,
      { id: turnId, question: asked, photoUrl: attached?.previewUrl ?? null, subject, answer: "", phase: "waiting", stop: null, failure: null },
    ]);
    setQuestion("");
    if (attached) setComposerPhoto(null);
    setAnnouncement(t.thinking);
    const update = (patch: Partial<Turn>) => setTurns((list) => list.map((turn) => (turn.id === turnId ? { ...turn, ...patch } : turn)));
    // After a failed send, the photo goes back to the composer for another try (if it is free).
    const givePhotoBack = () => {
      if (attached && !photoRef.current) setComposerPhoto(attached, consented);
    };

    const result = await askRancho(
      { question: asked, subject, language: locale, photo: attached, photoConsent: attached ? consented : undefined },
      {
        signal: controller.signal,
        onStart: ({ remaining, limit }) =>
          setStatus((s) => (s ? { ...s, remaining, limit, used: Math.max(0, limit - remaining) } : s)),
        onText: (text) => update({ answer: text, phase: "streaming" }),
      },
    );
    if (abortRef.current === controller) abortRef.current = null;
    // "New chat" cleared this question, or the panel went away (which also clears the chat): its turn
    // is gone and its photo already released.
    if (!mountedRef.current || chat !== chatRef.current) return;

    const failure = result.failure;
    if (failure?.kind === "not_configured" || failure?.kind === "limit") {
      // Not answered and not counted: drop the turn, give the question (and photo) back, show the notice.
      setTurns((list) => list.filter((turn) => turn.id !== turnId));
      setQuestion((current) => current || asked);
      givePhotoBack();
      if (attached) previewUrls.release(attached.previewUrl); // the dropped message's hold
      if (failure.kind === "not_configured") setNotConfigured(true);
      else {
        setLimitFailure(failure);
        setStatus((s) => (s ? { ...s, remaining: 0 } : s));
      }
      setAnnouncement(failure.kind === "not_configured" ? t.errors.notConnectedTitle : t.errors.limitTitle);
      return;
    }
    if (failure && !result.text) {
      setQuestion((current) => current || asked);
      // Not when the API refused the photo itself: a new one is needed.
      if (failure.kind !== "too_large" && failure.kind !== "invalid_image") givePhotoBack();
    }
    update({ answer: result.text, phase: "done", stop: result.stop, failure });
    setAnnouncement(result.text && result.stop !== "stopped" ? t.ready : (failureText(failure, t) ?? ""));
  }

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    pickRef.current += 1; // a photo still being prepared is dropped
    chatRef.current += 1;
    previewUrls.releaseAll();
    photoRef.current = null;
    setPhoto(null);
    setPhotoConsent(false);
    setPreparing(false);
    setPhotoError(null);
    setTurns([]);
    setQuestion("");
    setFieldError(null);
    setAnnouncement("");
    const field = textareaRef.current;
    (field && !field.disabled ? field : headingRef.current)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // Esc on the modal sheet: close through state so the launcher stays in sync.
    event.preventDefault();
    onClose();
  }

  function onQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  const answerLang = locale === "hi" ? "hi" : "en";
  const showCount = question.length > ASK_MAX_QUESTION_CHARS * 0.8;
  const questionError = fieldError?.field === "question" ? fieldError.message : null;
  const consentError = fieldError?.field === "consent" ? fieldError.message : null;
  const photoLabel = preparing ? t.photo.preparing : photo ? t.photo.change : t.photo.add;

  return (
    <dialog
      ref={dialogRef}
      id={id}
      aria-labelledby={ids.heading}
      aria-modal={modal ? true : undefined}
      data-modal={modal ? "true" : "false"}
      onKeyDown={onKeyDown}
      onCancel={onCancel}
      className={cn(
        "m-0 max-h-none max-w-none overflow-hidden border-0 bg-white p-0 text-ink print:hidden",
        "transition-[opacity,translate] duration-200 ease-out starting:opacity-0 motion-safe:starting:translate-y-4",
        modal
          ? "fixed inset-0 h-dvh w-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop:bg-transparent"
          : cn(
              "fixed inset-auto z-30 rounded-card border border-line shadow-[0_24px_60px_-12px_rgb(11_45_91/0.35)]",
              "right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.25rem)]",
              "h-[min(40rem,calc(100dvh-72px-6.5rem))] w-[min(25rem,calc(100vw-2rem))]",
            ),
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div data-surface="dark" className="flex shrink-0 items-center gap-3 bg-navy px-3 py-2.5 text-white sm:px-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white ring-2 ring-gold">
            <RanchoMascot className="size-9" title={t.mascotLabel} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={ids.heading} ref={headingRef} tabIndex={-1} className="text-base font-extrabold leading-snug focus:outline-none">
              {t.title}
            </h2>
            <p className="truncate text-xs leading-5 text-[#d3e1f3]">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={turns.length === 0 && !question && !photo && !preparing}
            className="grid size-11 shrink-0 place-items-center rounded-control text-white transition-colors hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <RotateCcw aria-hidden="true" className="size-[18px]" />
            <span className="sr-only">{t.reset}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-control text-white transition-colors hover:bg-white/10"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">{t.close}</span>
          </button>
        </div>

        <div ref={logRef} onScroll={onLogScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-page px-3 py-4 sm:px-4">
          <div className="flex items-start gap-2">
            <RanchoMascot className="mt-0.5 size-8 shrink-0" />
            <div className="min-w-0 rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2.5 text-[15px] leading-6">
              <p>{t.greeting}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{t.aiNote}</p>
            </div>
          </div>

          <ol className="mt-4 grid gap-4">
            {turns.map((turn) => {
              const error = failureText(turn.failure, t);
              return (
                <li key={turn.id} className="grid gap-3">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-navy px-3.5 py-2.5 text-[15px] leading-6 text-white">
                      <p className="sr-only">{t.you}:</p>
                      {turn.subject !== "auto" && (
                        <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-gold">{t.subjects[turn.subject]}</p>
                      )}
                      {turn.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview; the photo itself went only to /api/ask
                        <img
                          src={turn.photoUrl}
                          alt={t.photo.sentAlt}
                          className="my-1 max-h-48 w-auto max-w-full rounded-lg bg-white object-contain"
                        />
                      )}
                      {turn.question && <p className="whitespace-pre-wrap break-words">{turn.question}</p>}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <RanchoMascot className="mt-0.5 size-8 shrink-0" />
                    <div
                      aria-busy={turn.phase !== "done"}
                      className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2.5"
                    >
                      <p className="sr-only">{t.title}:</p>
                      {turn.phase === "waiting" && (
                        <p className="flex items-center gap-2 text-sm text-[#315475]">
                          <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin text-blue motion-reduce:animate-none" />
                          {t.thinking}
                        </p>
                      )}
                      {turn.answer && (
                        <div lang={answerLang}>
                          <AnswerContent text={turn.answer} />
                        </div>
                      )}
                      {turn.stop === "stopped" && <p className="mt-2 text-sm text-muted">{t.stopped}</p>}
                      {turn.stop === "max_tokens" && <p className="mt-2 text-sm text-[#8b5b00]">{t.truncated}</p>}
                      {turn.stop === "refusal" && <p className="mt-2 text-sm text-[#315475]">{t.refused}</p>}
                      {error && <p className="mt-1 text-sm font-semibold text-danger">{error}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {notConnected && (
            <Notice variant="warning" title={t.errors.notConnectedTitle} className="mt-4">
              <p>{t.errors.notConnectedBody}</p>
              <Link href={withEnquiryTool(links.enquiry, "ask")} onClick={onClose} className="mt-1 inline-block font-bold underline">
                {t.errors.enquiry}
              </Link>
            </Notice>
          )}
          {!notConnected && outOfQuestions && (
            <Notice variant="warning" title={t.errors.limitTitle} className="mt-4">
              <p>{format(t.errors.limitBody, { hours: hoursFromSeconds(limitFailure?.retryAfterSeconds ?? status?.resetsInSeconds) })}</p>
              {status?.account === "guest" && (
                <p className="mt-1">
                  {t.errors.limitGuest}{" "}
                  <Link href={links.signIn} onClick={onClose} className="font-bold underline">
                    {t.errors.signIn}
                  </Link>
                </p>
              )}
            </Notice>
          )}
        </div>

        {/* At most 70% of the panel (scrolls inside on short screens, e.g. with a photo attached), so the log stays visible. */}
        <form
          onSubmit={(event) => void send(event)}
          noValidate
          className="max-h-[70%] shrink-0 overflow-y-auto overscroll-contain border-t border-line bg-white px-3 pb-3 pt-2.5 sm:px-4"
        >
          <fieldset disabled={blocked} className="min-w-0">
            <fieldset className="min-w-0">
              <legend className="sr-only">{t.subjectLegend}</legend>
              <div className="flex flex-wrap gap-1.5">
                {ASK_SUBJECT_HINTS.map((value) => (
                  <label
                    key={value}
                    className={cn(
                      "inline-flex min-h-8 cursor-pointer items-center rounded-full border border-[#cfdcec] bg-white px-3 text-xs font-bold text-[#354b66] transition-colors",
                      "hover:border-blue has-checked:border-navy has-checked:bg-navy has-checked:text-white",
                      "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue",
                      "has-disabled:cursor-not-allowed has-disabled:opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${uid}-subject`}
                      value={value}
                      checked={subject === value}
                      onChange={() => setSubject(value)}
                      className="sr-only"
                    />
                    {t.subjects[value]}
                  </label>
                ))}
              </div>
            </fieldset>

            {photo && (
              <RanchoPhotoAttachment
                previewUrl={photo.previewUrl}
                consent={photoConsent}
                onConsentChange={(checked) => {
                  setPhotoConsent(checked);
                  if (consentError) setFieldError(null);
                }}
                onRemove={removePhoto}
                consentError={consentError}
                ids={{ consent: ids.consent, consentError: ids.consentError, note: ids.photoNote }}
                consentRef={consentRef}
                messages={t.photo}
              />
            )}
            {preparing && (
              <p className="mt-2 flex items-center gap-2 text-xs text-[#315475]">
                <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin text-blue motion-reduce:animate-none" />
                {t.photo.preparing}
              </p>
            )}

            <label htmlFor={ids.question} className="sr-only">
              {t.questionLabel}
            </label>
            <p id={ids.hint} className="sr-only">
              {t.keyHint}
            </p>
            <div className="mt-2 flex items-end gap-2">
              <textarea
                ref={textareaRef}
                id={ids.question}
                name="question"
                rows={2}
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  if (questionError) setFieldError(null);
                }}
                onKeyDown={onQuestionKeyDown}
                placeholder={photo ? t.photo.placeholder : t.placeholder}
                aria-invalid={questionError ? true : undefined}
                aria-describedby={cn(ids.hint, questionError && ids.error, ids.privacy)}
                className={cn(
                  "max-h-36 min-h-12 w-full min-w-0 flex-1 resize-none rounded-control border border-[#d8e2ef] bg-white px-3 py-2 text-[15px] leading-6 text-ink [field-sizing:content]",
                  "placeholder:text-[#7b8ba0] focus:border-blue disabled:bg-page",
                  questionError && "border-danger",
                )}
              />
              <button
                ref={photoButtonRef}
                type="button"
                onClick={choosePhoto}
                title={photoLabel}
                aria-disabled={preparing ? true : undefined}
                aria-describedby={photoError ? ids.photoError : undefined}
                className={cn(
                  "grid size-12 shrink-0 place-items-center rounded-control border border-[#b9cbe0] bg-white text-navy transition-colors hover:border-blue disabled:opacity-60",
                  preparing && "cursor-progress opacity-60",
                )}
              >
                {preparing ? (
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-blue motion-reduce:animate-none" />
                ) : (
                  <Camera aria-hidden="true" className="size-5" />
                )}
                <span className="sr-only">{photoLabel}</span>
              </button>
              {busy ? (
                <button
                  type="button"
                  onClick={stop}
                  className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-control border border-[#b9cbe0] bg-white px-3 text-sm font-bold text-navy hover:border-blue"
                >
                  <Square aria-hidden="true" className="size-3.5" />
                  {t.stop}
                </button>
              ) : (
                <button
                  type="submit"
                  aria-disabled={preparing ? true : undefined}
                  className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-control bg-gold px-3.5 text-sm font-bold text-ink transition hover:bg-gold-2 disabled:opacity-60 aria-disabled:cursor-progress aria-disabled:opacity-60"
                >
                  <Send aria-hidden="true" className="size-4" />
                  {t.send}
                </button>
              )}
            </div>
            {/* Any image: phones offer the camera or the gallery (no `capture`, unlike the Ask page). */}
            <input
              ref={fileInputRef}
              type="file"
              accept={RANCHO_PHOTO_ACCEPT}
              hidden
              tabIndex={-1}
              aria-label={t.photo.add}
              onChange={(event) => void onPhotoChosen(event.currentTarget)}
            />
          </fieldset>
          {questionError && (
            // role="alert": Enter in the field keeps focus there, so moving focus alone wouldn't announce it.
            <p id={ids.error} role="alert" className="mt-1 text-xs font-semibold text-danger">
              {questionError}
            </p>
          )}
          {photoError && (
            <p id={ids.photoError} role="alert" className="mt-1 text-xs font-semibold text-danger">
              {photoError}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            {status?.configured && !notConnected ? (
              <p className="tabular-nums text-muted">
                {status.remaining > 0 ? format(t.remaining, { remaining: status.remaining, limit: status.limit }) : t.remainingNone}
                {showCount && (
                  <span className={cn("ml-2", question.length > ASK_MAX_QUESTION_CHARS && "font-semibold text-danger")}>
                    · {format(t.charCount, { count: question.length, max: ASK_MAX_QUESTION_CHARS })}
                  </span>
                )}
              </p>
            ) : (
              <span />
            )}
            {/* Small text, but a 32px-tall hit area (WCAG 2.5.8; same height as the subject chips). */}
            <Link
              href={links.ask}
              onClick={onClose}
              className="inline-flex min-h-8 items-center text-xs font-semibold text-[#315475] underline underline-offset-2 hover:text-blue"
            >
              {t.fullPageLink}
            </Link>
          </div>
          <p id={ids.privacy} className="mt-2 text-xs leading-5 text-muted">
            <strong className="font-semibold text-[#8b5b00]">{t.disclaimer}</strong> {t.privacy}{" "}
            <Link href={links.privacy} onClick={onClose} className="font-semibold text-[#315475] underline">
              {t.privacyLink}
            </Link>
            {status?.configured && status.account === "student" ? <> {t.studentNote}</> : null}
          </p>
        </form>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </dialog>
  );
}
