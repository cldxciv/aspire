"use client";

import { AudioLines, Camera, Info, LoaderCircle, Maximize2, Mic, SendHorizontal, Square, SquarePen, X } from "lucide-react";
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

import { hoursFromSeconds, type AskFailure } from "@/components/ask/ask-client";
import { withEnquiryTool } from "@/components/forms/enquiry-context";
import { Notice } from "@/components/ui/Feedback";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import type { RanchoToolContext } from "@/lib/ask/cards";
import { ASK_LANGUAGES, ASK_MAX_QUESTION_CHARS, type AskLanguage, type AskStatus, type AskSubjectHint } from "@/lib/ask/constants";
import { answerPlainText } from "@/lib/ask/markdown";
import { cn } from "@/lib/cn";

import { RanchoMascot } from "./RanchoMascot";
import { RanchoPhotoAttachment } from "./RanchoPhotoAttachment";
import { RanchoSubjectChips, RanchoSubjectSelect } from "./RanchoSubjectPicker";
import { failureText, RanchoBubble, RanchoTurnView, type RanchoTurnData } from "./RanchoTurn";
import { askRancho, chatBlock, fetchAskStatus, RANCHO_DESKTOP_QUERY, validateQuestion } from "./rancho-chat";
import { listenForRanchoOpen, type RanchoHandoff } from "./rancho-handoff";
import {
  createPreviewUrls,
  loadRanchoPhoto,
  photoByteLimit,
  RANCHO_PHOTO_ACCEPT,
  type RanchoPhoto,
  type RanchoPhotoProblem,
} from "./rancho-photo";
import { speechLang, withTranscript, type VoiceProblem } from "./rancho-voice";
import { useSpeechInput, useSpeechOutput, useVoiceSupport } from "./useRanchoVoice";

export type RanchoPanelMessages = Messages<"rancho">["panel"];

export interface RanchoLinks {
  /** The full Rancho page (/tools/ask). */
  ask: string;
  /** The admissions enquiry form (`?from=ask` is added here). */
  enquiry: string;
  privacy: string;
  signIn: string;
}

type Turn = RanchoTurnData;

export interface RanchoChatProps {
  /** "panel": the floating launcher's dialog. "page": the chat card on /tools/ask and /rancho. */
  variant: "panel" | "page";
  messages: RanchoPanelMessages;
  locale: Locale;
  links: RanchoLinks;
  /** Panel: the dialog's id (the launcher's `aria-controls`). */
  id?: string;
  /** Panel: open or closed. The page chat is always open. */
  open?: boolean;
  /** Panel: close it (Esc, ✕, following a link). */
  onClose?: () => void;
  /** Panel: gets focus back when the panel closes (the launcher button). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Panel: the latest "Ask Rancho about this" handoff (the launcher listens). The page chat listens itself. */
  handoff?: RanchoHandoff | null;
  /** Visible heading (default: "Rancho"). */
  heading?: string;
  /** 👍 / 👎 under answers (the Ask page keeps a count on the device); no buttons without it. */
  onFeedback?: (value: "yes" | "no") => void;
  /**
   * Page: the card's size, replacing the default `h-[min(720px,calc(100dvh-5.5rem))] min-h-[28rem]`
   * (e.g. a full-height app layout on /rancho: "h-full min-h-0" inside a sized flex parent).
   */
  className?: string;
}

const noop = () => {};

function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(RANCHO_DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function photoProblemText(problem: RanchoPhotoProblem, t: RanchoPanelMessages["photo"]): string {
  if (problem === "unsupported") return t.errors.unsupported;
  return problem === "too_large" ? t.errors.tooLarge : t.errors.unreadable;
}

function voiceProblemText(problem: VoiceProblem | null, t: RanchoPanelMessages["voice"]): string | null {
  switch (problem) {
    case null:
      return null;
    case "denied":
      return t.errors.denied;
    case "no_mic":
      return t.errors.noMic;
    case "network":
      return t.errors.network;
    case "no_speech":
      return t.nothingHeard;
    default:
      return t.errors.other;
  }
}

// Every control is a 44px tap target (docs/agent-briefs.md: tap targets ≥44px on mobile).
const headerButton =
  "grid size-11 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white";
const composerButton =
  "grid size-11 shrink-0 place-items-center rounded-full text-[#315475] transition-colors hover:bg-surface hover:text-navy disabled:opacity-50";

/** The page's `scroll-padding-top` (clears the sticky header), in px. */
function scrollPaddingTop(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
}

/**
 * Rancho chat, shared by the floating panel (`variant="panel"`, lazy-loaded by RanchoLauncher) and
 * the Ask page / Rancho app (`variant="page"`, via AskAspire). Built so the conversation gets most of
 * the height:
 *
 * - Header: mascot, name, "N of M left today" (`GET /api/ask`), then icon buttons: voice mode (where
 *   the browser can listen and speak), New chat, and in the panel Open full page + Close. The page
 *   chat adds an answer-language select.
 * - One composer row: 📷 photo, 🎤 voice typing, an auto-growing field, a compact subject select
 *   (after the first question; before it, subject chips sit in the empty conversation) and a round
 *   Send. The photo's "no faces or names" box appears above the row once a photo is attached.
 * - A one-line "AI can make mistakes — check with your teacher · Privacy" with an ⓘ disclosure for
 *   the full AI, privacy and voice notes; the welcome message carries them once. The daily-limit and
 *   not-connected notices replace the composer.
 * - Answers can include tool cards (`{ t: "card" }`, RanchoToolCards) and have Listen (🔊) and Copy
 *   buttons. In voice mode the answer to a spoken question is read aloud automatically.
 * - "Ask Rancho about this" handoffs (rancho-handoff.ts) prefill the field and show a removable
 *   "From …" chip; the next question carries `toolContext`.
 *
 * The panel is a native `<dialog>`: `showModal()` on phones (full-height sheet, focus contained, page
 * inert and not scrollable), `show()` from 640px (non-modal popover above the launcher). Esc and ✕
 * close it; focus returns to the launcher. The conversation (photos included, as object URLs) is React
 * state only (no storage); "New chat" clears it, and so does the chat going away (unmounted, or
 * hidden by Next's `<Activity>`). Closing the panel stops a streaming answer, listening and reading.
 */
export function RanchoChat(props: RanchoChatProps) {
  const { variant, messages: t, locale, links, returnFocusRef, onFeedback } = props;
  const panel = variant === "panel";
  const open = panel ? props.open === true : true;
  const close = props.onClose ?? noop;

  const uid = useId();
  const ids = {
    heading: `${uid}-heading`,
    question: `${uid}-question`,
    hint: `${uid}-hint`,
    error: `${uid}-error`,
    privacy: `${uid}-privacy`,
    info: `${uid}-info`,
    language: `${uid}-language`,
    subject: `${uid}-subject`,
    subjectLine: `${uid}-subject-line`,
    photoError: `${uid}-photo-error`,
    voiceError: `${uid}-voice-error`,
    consent: `${uid}-consent`,
    consentError: `${uid}-consent-error`,
    photoNote: `${uid}-photo-note`,
  };

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
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
  /** The text in the field came (at least partly) from the microphone. */
  const spokenRef = useRef(false);
  /** Mirrors `voiceMode` for the end of an answer that started before a toggle. */
  const voiceModeRef = useRef(false);
  /** The last handoff whose prefill got focus. */
  const focusedHandoffRef = useRef(0);

  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(RANCHO_DESKTOP_QUERY).matches,
    () => false,
  );
  const modal = panel && !desktop;

  const voice = useVoiceSupport();
  const {
    listening,
    problem: voiceProblem,
    setProblem: setVoiceProblem,
    start: startListening,
    stop: stopListening,
    abort: abortListening,
  } = useSpeechInput();
  const { speakingId, speak, stop: stopSpeaking } = useSpeechOutput(t.voice.say);

  // The page chat listens for "Ask Rancho about this" itself (the launcher is hidden on these pages).
  const [pageHandoff, setPageHandoff] = useState<RanchoHandoff | null>(null);
  useEffect(() => (panel ? undefined : listenForRanchoOpen(setPageHandoff)), [panel]);
  const handoff = panel ? (props.handoff ?? null) : pageHandoff;

  const [status, setStatus] = useState<AskStatus | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState(() => handoff?.prompt ?? "");
  const [toolContext, setToolContext] = useState<RanchoToolContext | null>(() => handoff?.toolContext ?? null);
  const [handoffId, setHandoffId] = useState(() => handoff?.id ?? 0);
  const [subject, setSubject] = useState<AskSubjectHint>("auto");
  const [language, setLanguage] = useState<AskLanguage>(locale);
  const [fieldError, setFieldError] = useState<{ field: "question" | "consent"; message: string } | null>(null);
  const [photo, setPhoto] = useState<RanchoPhoto | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [previewUrls] = useState(() => createPreviewUrls());
  const [notConfigured, setNotConfigured] = useState(false);
  const [limitFailure, setLimitFailure] = useState<AskFailure | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, "yes" | "no">>({});

  // A new handoff: prefill the field (the student still presses Send) and show the "From …" chip.
  if (handoff && handoff.id !== handoffId) {
    setHandoffId(handoff.id);
    if (handoff.prompt) setQuestion(handoff.prompt);
    setToolContext(handoff.toolContext);
    setFieldError(null);
  }

  const busy = turns.some((turn) => turn.phase !== "done");
  const block = chatBlock(status, { notConfigured, limitReached: Boolean(limitFailure) });
  const notConnected = block === "not_connected";
  const outOfQuestions = block === "limit";
  const blocked = block !== null;
  /** Panel answers follow the page locale; the page chat has its own answer-language select. */
  const answerLanguage: AskLanguage = panel ? locale : language;

  // Panel: open / close the native dialog (modal on phones), and switch mode if the viewport crosses 640px.
  useEffect(() => {
    if (!panel) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      abortRef.current?.abort();
      abortListening();
      stopSpeaking();
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
  }, [panel, open, modal, returnFocusRef, abortListening, stopSpeaking]);

  // The page behind the phone sheet doesn't scroll.
  useEffect(() => {
    if (!open || !modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, modal]);

  // Connection + allowance, refreshed each time the panel opens (once for the page chat).
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetchAskStatus(controller.signal).then((next) => {
      if (next) setStatus(next);
    });
    return () => controller.abort();
  }, [open]);

  // When the composer is replaced by a notice (not connected / out of questions), keep focus in the chat.
  useEffect(() => {
    if (!blocked || !open || !panel) return;
    const active = document.activeElement;
    if (!active || active === document.body || !dialogRef.current?.contains(active)) headingRef.current?.focus();
  }, [blocked, open, panel]);

  // Follow the answer while it streams, unless the student scrolled up to read.
  useEffect(() => {
    const log = logRef.current;
    if (log && stickToBottom.current) log.scrollTop = log.scrollHeight;
  }, [turns, notConnected, outOfQuestions]);

  // The field grows with its text (typed, spoken or prefilled), up to a few lines. Empty, it stays one
  // line: a placeholder that would wrap in a narrow row is cut short (`placeholder:truncate`) instead.
  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "auto";
    const height = question ? field.scrollHeight : 0;
    field.style.height = height > 0 ? `${Math.min(height, 136)}px` : "";
  }, [question, open, photo, blocked]);

  // After a handoff: focus the field with the caret at the end of the prefilled text. On a page, the
  // chat card is brought into view first (focus alone would show only its bottom edge): all of it
  // when it fits below the sticky header, else its bottom, so the prefilled field and Send are on
  // screen. Once per handoff (not again when the panel reopens or the page is shown again after Back).
  useEffect(() => {
    if (!handoffId || !open || focusedHandoffRef.current === handoffId) return;
    focusedHandoffRef.current = handoffId;
    spokenRef.current = false;
    const field = textareaRef.current;
    if (!field || field.disabled) return;
    const section = sectionRef.current;
    if (!panel && section) {
      const fits = section.getBoundingClientRect().height <= window.innerHeight - scrollPaddingTop();
      section.scrollIntoView({ block: fits ? "nearest" : "end" });
    }
    field.focus({ preventScroll: !panel });
    field.setSelectionRange(field.value.length, field.value.length);
  }, [handoffId, open, panel]);

  // When the chat goes away: unmounted (e.g. the panel on the Ask page itself) or hidden by Next's
  // <Activity> (with Cache Components a route that is left keeps its state, and its effects are cleaned
  // up; RanchoDock sits in the (site) layout, so moving on to a (portal) page hides it). Either way:
  // stop a streaming answer, close the dialog (a hidden modal would leave the next page inert), free
  // the photos and start a fresh chat, so nothing is left pointing at a revoked photo URL or waiting
  // for an answer that was stopped. (The voice hooks stop listening / reading in their own cleanup.)
  // A passive effect on purpose: a layout effect's cleanup would also run whenever a Suspense
  // boundary above re-showed its fallback, which shouldn't wipe the chat.
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
      spokenRef.current = false;
      setPhoto(null);
      setPhotoConsent(false);
      setPreparing(false);
      setPhotoError(null);
      setTurns([]);
      // The composer's draft (typed text, a handoff's prefill and "From …" chip) stays: it points at
      // nothing that was freed, and React's dev double-mount (Strict Mode) runs this cleanup right
      // after the panel first mounts with a handoff, which must not wipe it.
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
      // Superseded ("New chat") or the chat went away while it was being prepared.
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

  function toggleMic() {
    if (listening) {
      stopListening();
      return;
    }
    stopSpeaking(); // never listen to Rancho's own voice
    setFieldError(null);
    const base = question;
    const started = startListening(speechLang(answerLanguage), {
      onText: (heard) => {
        if (heard) spokenRef.current = true;
        setQuestion(withTranscript(base, heard));
      },
      onEnd: (heard) => {
        setAnnouncement(heard ? t.voice.heard : "");
        textareaRef.current?.focus();
      },
    });
    if (started) setAnnouncement(t.voice.listening);
  }

  function toggleVoiceMode() {
    const next = !voiceModeRef.current;
    voiceModeRef.current = next;
    setVoiceMode(next);
    setAnnouncement(next ? t.voice.modeOn : t.voice.modeOff);
    if (!next) stopSpeaking();
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy || blocked) return;
    if (preparing) {
      // Send is aria-disabled meanwhile; say why nothing was sent.
      setAnnouncement(t.photo.wait);
      return;
    }
    // Send while listening: what is in the field (interim words included) is the question.
    if (listening) abortListening();
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
    setVoiceProblem(null);
    stopSpeaking();

    const asked = question.trim();
    const consented = photoConsent;
    const context = toolContext;
    const spoken = spokenRef.current;
    spokenRef.current = false;
    const askedLanguage = answerLanguage;
    const chat = chatRef.current;
    const turnId = nextTurnId.current++;
    const controller = new AbortController();
    abortRef.current = controller;
    stickToBottom.current = true;
    // The sent message keeps showing the photo; the composer lets go of it.
    if (attached) previewUrls.hold(attached.previewUrl);
    setTurns((list) => [
      ...list,
      {
        id: turnId,
        question: asked,
        photoUrl: attached?.previewUrl ?? null,
        subject,
        language: askedLanguage,
        toolContext: context,
        spoken,
        answer: "",
        cards: [],
        meta: null,
        phase: "waiting",
        stop: null,
        failure: null,
      },
    ]);
    setQuestion("");
    setToolContext(null);
    if (attached) setComposerPhoto(null);
    setAnnouncement(t.thinking);
    const update = (patch: Partial<Turn> | ((turn: Turn) => Partial<Turn>)) =>
      setTurns((list) => list.map((turn) => (turn.id === turnId ? { ...turn, ...(typeof patch === "function" ? patch(turn) : patch) } : turn)));
    // After a failed send, the photo (and tool context) go back to the composer for another try.
    const giveBack = (withPhoto: boolean) => {
      setQuestion((current) => current || asked);
      setToolContext((current) => current ?? context);
      if (withPhoto && attached && !photoRef.current) setComposerPhoto(attached, consented);
    };

    const result = await askRancho(
      { question: asked, subject, language: askedLanguage, photo: attached, photoConsent: attached ? consented : undefined, toolContext: context },
      {
        signal: controller.signal,
        onStart: ({ remaining, limit }) =>
          setStatus((s) => (s ? { ...s, remaining, limit, used: Math.max(0, limit - remaining) } : s)),
        onText: (text) => update({ answer: text, phase: "streaming" }),
        onCard: (card) => update((turn) => ({ cards: [...turn.cards, card] })),
      },
    );
    if (abortRef.current === controller) abortRef.current = null;
    // "New chat" cleared this question, or the chat went away (which also clears it): its turn is gone
    // and its photo already released.
    if (!mountedRef.current || chat !== chatRef.current) return;

    const failure = result.failure;
    if (failure?.kind === "not_configured" || failure?.kind === "limit") {
      // Not answered and not counted: drop the turn, give the question (and photo) back, show the notice.
      setTurns((list) => list.filter((turn) => turn.id !== turnId));
      giveBack(true);
      if (attached) previewUrls.release(attached.previewUrl); // the dropped message's hold
      if (failure.kind === "not_configured") setNotConfigured(true);
      else {
        setLimitFailure(failure);
        setStatus((s) => (s ? { ...s, remaining: 0 } : s));
      }
      setAnnouncement(failure.kind === "not_configured" ? t.errors.notConnectedTitle : t.errors.limitTitle);
      // The composer is replaced by the notice: keep focus in the chat.
      headingRef.current?.focus();
      return;
    }
    // Not when the API refused the photo itself: a new one is needed.
    if (failure && !result.text) giveBack(failure.kind !== "too_large" && failure.kind !== "invalid_image");
    update({ answer: result.text, cards: result.cards, meta: result.meta, phase: "done", stop: result.stop, failure });
    const answered = Boolean(result.text) && result.stop !== "stopped";
    setAnnouncement(answered ? t.ready : (failureText(failure, t) ?? ""));
    // Voice mode: a spoken question gets a spoken answer.
    if (answered && !failure && spoken && voiceModeRef.current) speak(turnId, result.text, speechLang(askedLanguage));
  }

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    abortListening();
    setVoiceProblem(null);
    stopSpeaking();
    pickRef.current += 1; // a photo still being prepared is dropped
    chatRef.current += 1;
    previewUrls.releaseAll();
    photoRef.current = null;
    spokenRef.current = false;
    setPhoto(null);
    setPhotoConsent(false);
    setPreparing(false);
    setPhotoError(null);
    setTurns([]);
    setQuestion("");
    setToolContext(null);
    setFieldError(null);
    setCopiedId(null);
    setFeedback({});
    setAnnouncement("");
    const field = textareaRef.current;
    (field && !field.disabled ? field : headingRef.current)?.focus();
  }

  function listen(turn: Turn) {
    if (speakingId === turn.id) stopSpeaking();
    else {
      abortListening();
      speak(turn.id, turn.answer, speechLang(turn.language));
    }
  }

  async function copyAnswer(turn: Turn) {
    try {
      await navigator.clipboard.writeText(answerPlainText(turn.answer));
      setCopiedId(turn.id);
      setAnnouncement(t.copied);
      window.setTimeout(() => setCopiedId((current) => (current === turn.id ? null : current)), 2000);
    } catch {
      // clipboard blocked: the text is still selectable
    }
  }

  function giveFeedback(turn: Turn, value: "yes" | "no") {
    setFeedback((current) => ({ ...current, [turn.id]: value }));
    onFeedback?.(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (listening) stopListening();
    else close();
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // Esc on the modal sheet: close through state so the launcher stays in sync.
    event.preventDefault();
    if (listening) stopListening();
    else close();
  }

  function onQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  const heading = props.heading ?? t.name;
  const remainingText =
    status?.configured && !notConnected
      ? status.remaining > 0
        ? format(t.remainingShort, { remaining: status.remaining, limit: status.limit })
        : t.remainingNone
      : t.subtitle;
  const showCount = question.length > ASK_MAX_QUESTION_CHARS * 0.8;
  const questionError = fieldError?.field === "question" ? fieldError.message : null;
  const consentError = fieldError?.field === "consent" ? fieldError.message : null;
  const voiceError = voiceProblemText(voiceProblem, t.voice);
  const photoLabel = preparing ? t.photo.preparing : photo ? t.photo.change : t.photo.add;
  const onNavigate = panel ? close : undefined;
  /** Enquiry links from Rancho record where the lead came from (D-039: `from=ask`, nothing else). */
  const enquiryHref = withEnquiryTool(links.enquiry, "ask");
  const lastTurn = turns.at(-1);
  /** The compact subject select (the chips stand in for it in the empty conversation). */
  const showSubjectSelect = turns.length > 0 && !blocked;

  const header = (
    <div data-surface="dark" className="flex shrink-0 items-center gap-0.5 bg-navy py-1 pl-3 pr-1 text-white sm:pl-4">
      <span className="mr-2 grid size-10 shrink-0 place-items-center rounded-full bg-white ring-2 ring-gold">
        <RanchoMascot className="size-8" title={t.mascotLabel} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={ids.heading} ref={headingRef} tabIndex={-1} className="truncate text-base font-extrabold leading-tight focus:outline-none">
          {heading}
        </h2>
        <p className="truncate text-xs leading-5 text-[#d3e1f3] tabular-nums">{remainingText}</p>
      </div>
      {!panel && (
        <>
          <label htmlFor={ids.language} className="sr-only">
            {t.answerLanguage}
          </label>
          <select
            id={ids.language}
            value={language}
            onChange={(event) => setLanguage(event.target.value === "hi" ? "hi" : "en")}
            title={t.answerLanguage}
            className="mr-0.5 h-11 max-w-28 shrink-0 cursor-pointer rounded-full border border-white/30 bg-navy-2 px-2.5 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
          >
            {ASK_LANGUAGES.map((value) => (
              <option key={value} value={value} lang={value === "hi" ? "hi" : "en"}>
                {t.languages[value]}
              </option>
            ))}
          </select>
        </>
      )}
      {voice.listen && voice.speak && (
        <button type="button" onClick={toggleVoiceMode} aria-pressed={voiceMode} title={t.voice.mode} className={cn(headerButton, "aria-pressed:bg-gold aria-pressed:text-navy aria-pressed:hover:bg-gold-2")}>
          <AudioLines aria-hidden="true" className="size-5" />
          <span className="sr-only">{t.voice.mode}</span>
        </button>
      )}
      <button
        type="button"
        onClick={reset}
        disabled={turns.length === 0 && !question && !photo && !preparing && !toolContext}
        title={t.reset}
        className={headerButton}
      >
        <SquarePen aria-hidden="true" className="size-[18px]" />
        <span className="sr-only">{t.reset}</span>
      </button>
      {panel && (
        <Link href={links.ask} onClick={close} title={t.fullPageLink} className={headerButton}>
          <Maximize2 aria-hidden="true" className="size-[18px]" />
          <span className="sr-only">{t.fullPageLink}</span>
        </Link>
      )}
      {panel && (
        <button type="button" onClick={close} title={t.close} className={headerButton}>
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">{t.close}</span>
        </button>
      )}
    </div>
  );

  const log = (
    <div ref={logRef} onScroll={onLogScroll} data-rancho-log="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-page px-3 py-3 sm:px-4">
      <RanchoBubble>
        <p>{t.greeting}</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {t.aiNote} {t.privacy}{" "}
          <Link href={links.privacy} onClick={onNavigate} className="font-semibold text-[#315475] underline">
            {t.privacyLink}
          </Link>
        </p>
      </RanchoBubble>

      {turns.length === 0 && !blocked && <RanchoSubjectChips name={`${uid}-subject`} value={subject} onChange={setSubject} messages={t} />}

      <ol className="mt-3 grid gap-3 empty:hidden">
        {turns.map((turn) => (
          <RanchoTurnView
            key={turn.id}
            turn={turn}
            messages={t}
            locale={locale}
            onNavigate={onNavigate}
            canSpeak={voice.speak}
            speaking={speakingId === turn.id}
            copied={copiedId === turn.id}
            feedback={feedback[turn.id]}
            onListen={() => listen(turn)}
            onCopy={() => void copyAnswer(turn)}
            onFeedback={onFeedback ? (value) => giveFeedback(turn, value) : undefined}
          />
        ))}
      </ol>
      {lastTurn?.phase === "done" && lastTurn.answer && (
        // One quiet line under the latest answer: a human can help too (D-039: `from=ask`).
        <p data-rancho-stuck="" className="mt-2 pl-10 text-xs leading-5 text-muted">
          {t.stuck}{" "}
          <Link href={enquiryHref} onClick={onNavigate} className="inline-flex min-h-11 items-center font-semibold text-[#315475] underline underline-offset-2 hover:text-blue">
            {t.errors.enquiry}
          </Link>
        </p>
      )}
    </div>
  );

  const blockedNotice = notConnected ? (
    <Notice variant="warning" title={t.errors.notConnectedTitle} className="mb-1">
      <p>{t.errors.notConnectedBody}</p>
      <Link href={enquiryHref} onClick={onNavigate} className="mt-1 inline-block font-bold underline">
        {t.errors.enquiry}
      </Link>
    </Notice>
  ) : outOfQuestions ? (
    <Notice variant="warning" title={t.errors.limitTitle} className="mb-1">
      <p>{format(t.errors.limitBody, { hours: hoursFromSeconds(limitFailure?.retryAfterSeconds ?? status?.resetsInSeconds) })}</p>
      {status?.account === "guest" && (
        <p className="mt-1">
          {t.errors.limitGuest}{" "}
          <Link href={links.signIn} onClick={onNavigate} className="font-bold underline">
            {t.errors.signIn}
          </Link>
        </p>
      )}
    </Notice>
  ) : null;

  const composer = (
    <form onSubmit={(event) => void send(event)} noValidate data-rancho-composer="">
      {toolContext && (
        <div data-rancho-context="" className="mb-2 flex items-center gap-1 rounded-full bg-blue-soft py-0.5 pl-3 pr-0.5 text-xs leading-5 text-[#0755b5]">
          <p className="min-w-0 flex-1 truncate" title={toolContext.summary}>
            <span className="font-bold">{format(t.handoff.from, { tool: t.handoff.tools[toolContext.tool] })}</span> — {toolContext.summary}
          </p>
          {/* A 44px target drawn as a 32px circle; it overhangs the slim chip into the gaps around it. */}
          <button
            type="button"
            onClick={() => {
              setToolContext(null);
              textareaRef.current?.focus();
            }}
            title={t.handoff.remove}
            className="group -my-1.5 -mr-1.5 grid size-11 shrink-0 place-items-center rounded-full"
          >
            <span className="grid size-8 place-items-center rounded-full transition-colors group-hover:bg-white">
              <X aria-hidden="true" className="size-4" />
            </span>
            <span className="sr-only">{t.handoff.remove}</span>
          </button>
        </div>
      )}
      {photo && (
        <div className="mb-2">
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
        </div>
      )}
      {preparing && (
        <p className="mb-2 flex items-center gap-2 text-xs text-[#315475]">
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
      <div className="flex items-end gap-2">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-end gap-0.5 rounded-[23px] border border-[#cfdcec] bg-white transition-colors",
            "has-[textarea:focus-visible]:border-blue has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-blue/25",
            questionError && "border-danger",
            listening && "border-danger ring-2 ring-danger/20",
          )}
        >
          <button
            ref={photoButtonRef}
            type="button"
            onClick={choosePhoto}
            title={photoLabel}
            aria-disabled={preparing ? true : undefined}
            aria-describedby={photoError ? ids.photoError : undefined}
            className={cn(composerButton, preparing && "cursor-progress opacity-60")}
          >
            {preparing ? (
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-blue motion-reduce:animate-none" />
            ) : (
              <Camera aria-hidden="true" className="size-5" />
            )}
            <span className="sr-only">{photoLabel}</span>
          </button>
          {voice.listen && (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={listening}
              title={listening ? t.voice.stop : t.voice.start}
              aria-describedby={voiceError ? ids.voiceError : undefined}
              className={cn(composerButton, listening && "bg-danger text-white hover:bg-danger hover:text-white motion-safe:animate-pulse")}
            >
              {listening ? <Square aria-hidden="true" className="size-4" /> : <Mic aria-hidden="true" className="size-5" />}
              <span className="sr-only">{listening ? t.voice.stop : t.voice.start}</span>
            </button>
          )}
          <textarea
            ref={textareaRef}
            id={ids.question}
            name="question"
            rows={1}
            value={question}
            readOnly={listening}
            onChange={(event) => {
              setQuestion(event.target.value);
              if (!event.target.value.trim()) spokenRef.current = false;
              if (questionError) setFieldError(null);
            }}
            onKeyDown={onQuestionKeyDown}
            placeholder={listening ? t.voice.listening : photo ? t.photo.placeholder : t.placeholder}
            aria-invalid={questionError ? true : undefined}
            aria-describedby={cn(ids.hint, questionError && ids.error, ids.privacy)}
            className="max-h-34 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1.5 py-2.5 text-[15px] leading-6 text-ink placeholder:truncate placeholder:text-[#7b8ba0] focus:outline-none"
          />
          {/* In the row when there is room; in a narrow chat it sits on the line below instead. */}
          {showSubjectSelect && (
            <RanchoSubjectSelect
              id={ids.subject}
              placement="row"
              className="hidden @min-[23rem]:flex"
              value={subject}
              onChange={setSubject}
              messages={t}
            />
          )}
        </div>
        {busy ? (
          <button
            type="button"
            onClick={stop}
            title={t.stop}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-[#b9cbe0] bg-white text-navy transition-colors hover:border-blue"
          >
            <Square aria-hidden="true" className="size-4" />
            <span className="sr-only">{t.stop}</span>
          </button>
        ) : (
          <button
            type="submit"
            title={t.send}
            aria-disabled={preparing ? true : undefined}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-gold text-navy transition-colors hover:bg-gold-2 aria-disabled:cursor-progress aria-disabled:opacity-60"
          >
            <SendHorizontal aria-hidden="true" className="size-5" />
            <span className="sr-only">{t.send}</span>
          </button>
        )}
      </div>
      {/* Any image: phones offer the camera or the gallery (no `capture`). */}
      <input
        ref={fileInputRef}
        type="file"
        accept={RANCHO_PHOTO_ACCEPT}
        hidden
        tabIndex={-1}
        aria-label={t.photo.add}
        onChange={(event) => void onPhotoChosen(event.currentTarget)}
      />
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
      {voiceError && (
        <p id={ids.voiceError} role="alert" className="mt-1 text-xs font-semibold text-danger">
          {voiceError}
        </p>
      )}
    </form>
  );

  const footer = (
    // A size container: the subject select moves out of a narrow composer row onto the line below.
    <div className="@container max-h-[60%] shrink-0 overflow-y-auto overscroll-contain border-t border-line bg-white px-3 pt-2 sm:px-4">
      {blocked ? blockedNotice : composer}
      <div className="flex items-center gap-1 text-[11px] leading-4 text-muted">
        <p id={ids.privacy} className="min-w-0 flex-1 py-1">
          <strong className="font-semibold text-[#8b5b00]">{t.disclaimer}</strong>
          {" · "}
          <Link href={links.privacy} onClick={onNavigate} className="font-semibold text-[#315475] underline underline-offset-2 hover:text-blue">
            {t.privacyShort}
          </Link>
        </p>
        {showCount && !blocked && (
          <span className={cn("tabular-nums", question.length > ASK_MAX_QUESTION_CHARS && "font-semibold text-danger")}>
            {format(t.charCount, { count: question.length, max: ASK_MAX_QUESTION_CHARS })}
          </span>
        )}
        {showSubjectSelect && (
          <RanchoSubjectSelect
            id={ids.subjectLine}
            placement="line"
            className="flex @min-[23rem]:hidden"
            value={subject}
            onChange={setSubject}
            messages={t}
          />
        )}
        <button
          type="button"
          onClick={() => setInfoOpen((value) => !value)}
          aria-expanded={infoOpen}
          aria-controls={ids.info}
          title={t.infoLabel}
          className="grid size-11 shrink-0 place-items-center rounded-full text-[#315475] transition-colors hover:bg-surface hover:text-navy aria-expanded:bg-surface"
        >
          <Info aria-hidden="true" className="size-4" />
          <span className="sr-only">{t.infoLabel}</span>
        </button>
      </div>
      <div id={ids.info} hidden={!infoOpen} data-rancho-info="" className="mb-1.5 rounded-control bg-surface px-3 py-2 text-xs leading-5 text-[#315475]">
        <p>
          <strong className="font-semibold text-[#8b5b00]">{t.disclaimer}</strong> {t.aiNote}
        </p>
        <p className="mt-1">
          {t.privacy}{" "}
          <Link href={links.privacy} onClick={onNavigate} className="font-semibold underline">
            {t.privacyLink}
          </Link>
        </p>
        <p className="mt-1">{t.voice.note}</p>
        {status?.configured && status.account === "student" && <p className="mt-1">{t.studentNote}</p>}
      </div>
    </div>
  );

  const live = (
    <p className="sr-only" role="status" aria-live="polite">
      {announcement}
    </p>
  );

  if (!panel) {
    return (
      <section
        ref={sectionRef}
        aria-labelledby={ids.heading}
        data-rancho-chat="page"
        className={cn(
          // No scroll margin of its own: the page's scroll-padding-top already clears the sticky header.
          "flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-white text-ink shadow-soft",
          // `className` replaces the default size (cn() doesn't resolve competing Tailwind utilities).
          props.className ?? "h-[min(720px,calc(100dvh-5.5rem))] min-h-[28rem]",
        )}
      >
        {header}
        {log}
        {footer}
        {live}
      </section>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      id={props.id}
      aria-labelledby={ids.heading}
      aria-modal={modal ? true : undefined}
      data-modal={modal ? "true" : "false"}
      data-rancho-chat="panel"
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
              "h-[min(680px,calc(100dvh-72px-6.5rem))] w-[min(26rem,calc(100vw-2rem))] lg:w-[min(28rem,calc(100vw-2rem))]",
            ),
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        {header}
        {log}
        {footer}
      </div>
      {live}
    </dialog>
  );
}
