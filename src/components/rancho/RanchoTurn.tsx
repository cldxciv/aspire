import { Check, Copy, LoaderCircle, Square, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import type { ReactNode } from "react";

import { AnswerContent } from "@/components/ask/AnswerContent";
import type { AskFailure } from "@/components/ask/ask-client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import type { RanchoToolCard, RanchoToolContext } from "@/lib/ask/cards";
import type { AskAnswerMeta, AskLanguage, AskSubjectHint } from "@/lib/ask/constants";
import { cn } from "@/lib/cn";

import { RanchoMascot } from "./RanchoMascot";
import { RanchoToolCards } from "./RanchoToolCards";
import type { RanchoStop } from "./rancho-chat";

type PanelMessages = Messages<"rancho">["panel"];

/** One question and its answer in the Rancho chat (React state only). */
export interface RanchoTurnData {
  id: number;
  /** Empty for a photo-only question. */
  question: string;
  /** Preview object URL of the photo sent with this question (revoked on "New chat" / unmount). */
  photoUrl: string | null;
  subject: AskSubjectHint;
  /** Language the answer was asked in (for `lang` and reading it aloud). */
  language: AskLanguage;
  toolContext: RanchoToolContext | null;
  /** Asked with the microphone: in voice mode the answer is read aloud. */
  spoken: boolean;
  answer: string;
  cards: RanchoToolCard[];
  meta: AskAnswerMeta | null;
  /**
   * "held": the lead gate asked for contact details first (docs/lead-gate-plan.md §8.6). Only the
   * student's message shows; the chat puts the contact form (or "Send now") under it, and the
   * question is resent from there.
   */
  phase: "waiting" | "streaming" | "done" | "held";
  stop: RanchoStop | null;
  failure: AskFailure | null;
}

/**
 * Failure → copy shown in Rancho's bubble (not_configured and limit replace the composer instead;
 * the lead gate's refusal shows the contact form under the question instead).
 */
export function failureText(failure: AskFailure | null, t: PanelMessages): string | null {
  if (!failure) return null;
  switch (failure.kind) {
    case "not_configured":
    case "limit":
    case "gate":
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

/** Rancho's side of the conversation: the mascot and a white bubble. */
export function RanchoBubble({ children, busy, wide }: { children: ReactNode; busy?: boolean; wide?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <RanchoMascot className="mt-0.5 size-8 shrink-0" />
      <div
        aria-busy={busy}
        className={cn("min-w-0 rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2.5 text-[15px] leading-6", wide && "flex-1")}
      >
        {children}
      </div>
    </div>
  );
}

/** 44px tap targets; the row overlaps the bubble's bottom padding so it adds little height. */
const answerButton =
  "grid size-11 shrink-0 place-items-center rounded-full text-[#315475] transition-colors hover:bg-surface hover:text-navy aria-pressed:bg-blue-soft aria-pressed:text-blue";

/**
 * One exchange: the student's bubble (subject / "From <tool>" tag, photo, text) and Rancho's (tool
 * cards, the streamed answer, stop notes, errors; none while the question is held by the lead gate). A finished answer gets a slim footer: its topic tag,
 * 🔊 Listen (where the browser can speak), Copy and, on the Ask page, 👍 / 👎. Presentational.
 */
export function RanchoTurnView({
  turn,
  messages: t,
  locale,
  onNavigate,
  canSpeak,
  speaking,
  copied,
  feedback,
  onListen,
  onCopy,
  onFeedback,
}: {
  turn: RanchoTurnData;
  messages: PanelMessages;
  locale: Locale;
  /** Called when a card link is followed (the floating panel closes). */
  onNavigate?: () => void;
  canSpeak: boolean;
  speaking: boolean;
  copied: boolean;
  /** The 👍 / 👎 already given for this answer. */
  feedback?: "yes" | "no";
  onListen: () => void;
  onCopy: () => void;
  /** Absent: no feedback buttons (the floating panel). */
  onFeedback?: (value: "yes" | "no") => void;
}) {
  const error = failureText(turn.failure, t);
  const working = turn.phase !== "done" && !turn.answer;
  const tags = [
    turn.subject !== "auto" ? t.subjects[turn.subject] : null,
    turn.toolContext ? format(t.handoff.from, { tool: t.handoff.tools[turn.toolContext.tool] }) : null,
  ].filter(Boolean);
  const listenLabel = speaking ? t.voice.stopReading : t.voice.listen;
  const copyLabel = copied ? t.copied : t.copy;

  return (
    <li className="grid min-w-0 gap-3" data-rancho-turn={turn.phase}>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-navy px-3.5 py-2 text-[15px] leading-6 text-white">
          <p className="sr-only">{t.you}:</p>
          {tags.length > 0 && <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-gold">{tags.join(" · ")}</p>}
          {turn.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview; the photo itself went only to /api/ask
            <img src={turn.photoUrl} alt={t.photo.sentAlt} className="my-1 max-h-48 w-auto max-w-full rounded-lg bg-white object-contain" />
          )}
          {turn.question && <p className="whitespace-pre-wrap break-words">{turn.question}</p>}
        </div>
      </div>
      {turn.phase !== "held" && (
      <RanchoBubble busy={turn.phase !== "done"} wide>
        <p className="sr-only">{t.name}:</p>
        <RanchoToolCards cards={turn.cards} messages={t.cards} locale={locale} onNavigate={onNavigate} />
        {working && (
          <p className="flex items-center gap-2 text-sm text-[#315475]">
            <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin text-blue motion-reduce:animate-none" />
            {t.thinking}
          </p>
        )}
        {turn.answer && (
          <div lang={turn.language === "hi" ? "hi" : "en"}>
            <AnswerContent text={turn.answer} />
          </div>
        )}
        {turn.stop === "stopped" && <p className="mt-2 text-sm text-muted">{t.stopped}</p>}
        {turn.stop === "max_tokens" && <p className="mt-2 text-sm text-[#8b5b00]">{t.truncated}</p>}
        {turn.stop === "refusal" && <p className="mt-2 text-sm text-[#315475]">{t.refused}</p>}
        {error && <p className="mt-1 text-sm font-semibold text-danger">{error}</p>}
        {turn.phase === "done" && turn.answer && (
          <div data-rancho-actions="" className="-mb-2 mt-2 flex items-center border-t border-line">
            {/* `w-0`: the one-line tag must not widen the bubble (its full width would otherwise count
                as the row's minimum and push the chat sideways on a phone). */}
            <p className="w-0 min-w-0 flex-1 truncate text-[11px] leading-4 text-muted">
              {turn.meta && turn.meta.subject !== "other" && (
                <>
                  {t.subjects[turn.meta.subject]}
                  {turn.meta.topic && (
                    <>
                      {" · "}
                      <span lang="en">{turn.meta.topic}</span>
                    </>
                  )}
                  {turn.meta.difficulty && <> · {t.difficulty[turn.meta.difficulty]}</>}
                </>
              )}
            </p>
            {canSpeak && (
              <button type="button" onClick={onListen} aria-pressed={speaking} title={listenLabel} className={answerButton}>
                {speaking ? <Square aria-hidden="true" className="size-3.5" /> : <Volume2 aria-hidden="true" className="size-4" />}
                <span className="sr-only">{listenLabel}</span>
              </button>
            )}
            <button type="button" onClick={onCopy} title={copyLabel} className={answerButton}>
              {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
              <span className="sr-only">{copyLabel}</span>
            </button>
            {onFeedback &&
              (feedback ? (
                <span className="min-w-0 px-1.5 text-[11px] leading-4 text-muted">{t.helpful.thanks}</span>
              ) : (
                <>
                  <button type="button" onClick={() => onFeedback("yes")} title={t.helpful.yes} className={answerButton}>
                    <ThumbsUp aria-hidden="true" className="size-4" />
                    <span className="sr-only">{t.helpful.yes}</span>
                  </button>
                  <button type="button" onClick={() => onFeedback("no")} title={t.helpful.no} className={answerButton}>
                    <ThumbsDown aria-hidden="true" className="size-4" />
                    <span className="sr-only">{t.helpful.no}</span>
                  </button>
                </>
              ))}
          </div>
        )}
      </RanchoBubble>
      )}
    </li>
  );
}
