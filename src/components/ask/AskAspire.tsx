"use client";

import { Camera, Check, Copy, ImageOff, LoaderCircle, Send, Square, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button, ButtonLink, Notice } from "@/components/ui";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import {
  ASK_ENDPOINT,
  ASK_LANGUAGES,
  ASK_MAX_QUESTION_CHARS,
  ASK_SUBJECT_HINTS,
  type AskAnswerMeta,
  type AskLanguage,
  type AskStatus,
  type AskStreamEvent,
  type AskSubjectHint,
} from "@/lib/ask/constants";
import { answerPlainText } from "@/lib/ask/markdown";
import { splitAnswer } from "@/lib/ask/trailer";
import { cn } from "@/lib/cn";

import { AnswerContent } from "./AnswerContent";
import { createNdjsonDecoder, failureFromResponse, hoursFromSeconds, type AskFailure } from "./ask-client";
import { PhotoError, preparePhoto, type PreparedPhoto } from "./prepare-photo";

type Phase = "idle" | "sending" | "streaming" | "done";
type StopReason = Extract<AskStreamEvent, { t: "done" }>["stop"] | "stopped";

const FEEDBACK_KEY = "aspire.ask.feedback.v1";

/** Counts helpful / not helpful on this device only (no question or answer is kept). */
function saveFeedback(value: "yes" | "no") {
  try {
    const raw = window.localStorage.getItem(FEEDBACK_KEY);
    const counts = raw ? (JSON.parse(raw) as { yes?: number; no?: number }) : {};
    counts[value] = (Number(counts[value]) || 0) + 1;
    window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify({ yes: counts.yes ?? 0, no: counts.no ?? 0 }));
  } catch {
    // storage unavailable: feedback is optional
  }
}

const controlClasses =
  "w-full rounded-lg border border-[#d8e2ef] bg-white px-3 py-2.5 text-[15px] text-ink transition-colors placeholder:text-[#7b8ba0] focus:border-blue";

export function AskAspire({
  messages: t,
  locale,
  links,
}: {
  messages: Messages<"ask">;
  locale: Locale;
  links: { enquiry: string; signIn: string; privacy: string };
}) {
  const formId = useId();
  const ids = {
    subject: `${formId}-subject`,
    question: `${formId}-question`,
    questionHint: `${formId}-question-hint`,
    questionError: `${formId}-question-error`,
    photo: `${formId}-photo`,
    photoHint: `${formId}-photo-hint`,
    consent: `${formId}-consent`,
    consentError: `${formId}-consent-error`,
    privacy: `${formId}-privacy`,
    answerHeading: `${formId}-answer`,
  };

  const [status, setStatus] = useState<AskStatus | null>(null);
  const [subject, setSubject] = useState<AskSubjectHint>("auto");
  const [language, setLanguage] = useState<AskLanguage>(locale);
  const [question, setQuestion] = useState("");
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: "question" | "photoConsent"; message: string } | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [answer, setAnswer] = useState("");
  const [answerLanguage, setAnswerLanguage] = useState<AskLanguage>(locale);
  const [meta, setMeta] = useState<AskAnswerMeta | null>(null);
  const [stop, setStop] = useState<StopReason | null>(null);
  const [failure, setFailure] = useState<AskFailure | null>(null);
  const [feedback, setFeedback] = useState<"yes" | "no" | null>(null);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const answerRef = useRef<HTMLElement | null>(null);

  // Allowance and connection state (dynamic, so it is fetched rather than prerendered).
  useEffect(() => {
    const controller = new AbortController();
    fetch(ASK_ENDPOINT, { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { ok?: boolean; data?: AskStatus } | null) => {
        if (body?.ok && body.data) setStatus(body.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // Release the preview's object URL when the photo changes or the page unmounts.
  useEffect(() => {
    const url = photo?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  const notConnected = status?.configured === false || failure?.kind === "not_configured";
  const outOfQuestions = status !== null && status.configured && status.remaining <= 0;
  const busy = phase === "sending" || phase === "streaming";

  async function onPhotoChange(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhoto(await preparePhoto(file));
      setConsent(false);
    } catch (error) {
      setPhoto(null);
      setPhotoError(error instanceof PhotoError && error.code === "too_large" ? t.form.photoTooLarge : t.form.photoUnreadable);
    } finally {
      setPhotoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePhoto() {
    setPhoto(null);
    setConsent(false);
    setPhotoError(null);
    if (fieldError?.field === "photoConsent") setFieldError(null);
  }

  function validate(): boolean {
    const trimmed = question.trim();
    if (!trimmed && !photo) {
      setFieldError({ field: "question", message: t.form.errors.questionRequired });
      return false;
    }
    if (trimmed.length > ASK_MAX_QUESTION_CHARS) {
      setFieldError({ field: "question", message: format(t.form.errors.questionTooLong, { max: ASK_MAX_QUESTION_CHARS }) });
      return false;
    }
    if (photo && !consent) {
      setFieldError({ field: "photoConsent", message: t.form.errors.consentRequired });
      return false;
    }
    setFieldError(null);
    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || photoBusy || !validate()) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("sending");
    setAnswer("");
    setAnswerLanguage(language);
    setMeta(null);
    setStop(null);
    setFailure(null);
    setFeedback(null);
    setCopied(false);

    let response: Response;
    try {
      response = await fetch(ASK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          subject,
          language,
          image: photo ? { mediaType: photo.mediaType, data: photo.base64 } : null,
          photoConsent: photo ? consent : undefined,
        }),
        signal: controller.signal,
      });
    } catch {
      setFailure(controller.signal.aborted ? null : { kind: "network" });
      setPhase(controller.signal.aborted ? "idle" : "done");
      return;
    }

    if (!response.ok || !response.body) {
      const body: unknown = await response.json().catch(() => null);
      const next = failureFromResponse(response.status, body, response.headers.get("retry-after"));
      setFailure(next);
      if (next.kind === "limit") setStatus((s) => (s ? { ...s, remaining: 0 } : s));
      if (next.kind === "not_configured") setStatus((s) => (s ? { ...s, configured: false } : s));
      if (next.kind === "validation" && next.field) {
        setFieldError({
          field: next.field === "photoConsent" ? "photoConsent" : "question",
          message: next.field === "photoConsent" ? t.form.errors.consentRequired : t.form.errors.questionRequired,
        });
      }
      setPhase("done");
      return;
    }

    setPhase("streaming");
    answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const reader = response.body.getReader();
    const textDecoder = new TextDecoder();
    const lines = createNdjsonDecoder();
    let text = "";
    let finished = false;
    const apply = (events: AskStreamEvent[]) => {
      for (const streamEvent of events) {
        if (streamEvent.t === "start") {
          const { remaining, limit } = streamEvent;
          setStatus((s) => (s ? { ...s, remaining, limit, used: Math.max(0, limit - remaining) } : s));
        } else if (streamEvent.t === "delta") {
          text += streamEvent.text;
          setAnswer(text);
        } else if (streamEvent.t === "done") {
          finished = true;
          setMeta(streamEvent.meta);
          setStop(streamEvent.stop);
        } else {
          finished = true;
          setFailure({ kind: streamEvent.code === "interrupted" ? "interrupted" : "busy" });
        }
      }
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          apply(lines.push(textDecoder.decode()));
          apply(lines.end());
          break;
        }
        apply(lines.push(textDecoder.decode(value, { stream: true })));
      }
      if (!finished) setFailure({ kind: "interrupted" });
    } catch {
      if (controller.signal.aborted) setStop("stopped");
      else setFailure({ kind: text ? "interrupted" : "network" });
    } finally {
      // Safety net: never show a trailer the server did not strip.
      setAnswer(splitAnswer(text).answer);
      setPhase("done");
      abortRef.current = null;
    }
  }

  function stopAnswer() {
    abortRef.current?.abort();
  }

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(answerPlainText(answer));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the text is still selectable
    }
  }

  function giveFeedback(value: "yes" | "no") {
    setFeedback(value);
    saveFeedback(value);
  }

  function askAnother() {
    setPhase("idle");
    setAnswer("");
    setMeta(null);
    setStop(null);
    setFailure(null);
    setFeedback(null);
    setQuestion("");
    removePhoto();
    document.getElementById(ids.question)?.focus();
  }

  const failureMessage = (() => {
    if (!failure) return null;
    switch (failure.kind) {
      case "not_configured":
        return null; // shown as the "not connected" panel
      case "limit":
        return null; // shown as the limit panel
      case "busy":
        return t.errors.busy;
      case "network":
        return t.errors.network;
      case "interrupted":
        return t.errors.interrupted;
      case "too_large":
        return t.errors.tooLarge;
      case "invalid_image":
        return t.errors.invalidImage;
      case "blocked":
        return t.errors.blocked;
      case "validation":
        return null; // shown next to the field
      default:
        return t.errors.generic;
    }
  })();

  const showAnswer = phase !== "idle" && (phase === "sending" || phase === "streaming" || answer.length > 0);
  const questionInvalid = fieldError?.field === "question";
  const consentInvalid = fieldError?.field === "photoConsent";
  const limitReached = failure?.kind === "limit" || outOfQuestions;

  return (
    <div className="min-w-0">
      <div className="rounded-card border border-line bg-white p-5 shadow-soft md:p-7">
        <h2 className="text-2xl font-extrabold leading-snug text-navy">{t.form.heading}</h2>
        <p className="mt-1 text-sm text-muted">{t.form.lead}</p>

        {notConnected && (
          <Notice variant="warning" title={t.errors.notConnectedTitle} className="mt-5" role="status">
            <p>{t.errors.notConnectedBody}</p>
            <Link href={links.enquiry} className="mt-1 inline-block font-bold underline">
              {t.stuck.cta}
            </Link>
          </Notice>
        )}

        {!notConnected && limitReached && (
          <Notice variant="warning" title={t.errors.limitTitle} className="mt-5" role="status">
            <p>{format(t.errors.limitBody, { hours: hoursFromSeconds(failure?.retryAfterSeconds ?? status?.resetsInSeconds) })}</p>
            {status?.account === "guest" && <p className="mt-1">{t.errors.limitGuest}</p>}
          </Notice>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-5" aria-describedby={ids.privacy}>
          <fieldset disabled={notConnected || busy} className="grid min-w-0 gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={ids.subject} className="text-sm font-semibold text-[#354b66]">
                  {t.form.subjectLabel}
                </label>
                <select
                  id={ids.subject}
                  name="subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value as AskSubjectHint)}
                  className={cn(controlClasses, "min-h-11")}
                >
                  {ASK_SUBJECT_HINTS.map((value) => (
                    <option key={value} value={value}>
                      {t.form.subjects[value]}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-sm font-semibold text-[#354b66]">{t.form.languageLegend}</legend>
                <div className="flex gap-1 rounded-[9px] bg-surface p-1">
                  {ASK_LANGUAGES.map((value) => (
                    <label
                      key={value}
                      lang={value === "hi" ? "hi" : "en"}
                      className={cn(
                        "flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-[7px] px-2 py-1.5 text-center",
                        "text-sm font-bold text-muted transition-colors [&:not(:has(:checked)):hover]:text-navy",
                        "has-checked:bg-navy has-checked:text-white",
                        "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue",
                      )}
                    >
                      <input
                        type="radio"
                        name="language"
                        value={value}
                        checked={language === value}
                        onChange={() => setLanguage(value)}
                        className="sr-only"
                      />
                      {t.form.languages[value]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={ids.question} className="text-sm font-semibold text-[#354b66]">
                  {t.form.questionLabel}
                </label>
                <span className={cn("text-xs tabular-nums", question.length > ASK_MAX_QUESTION_CHARS ? "text-danger" : "text-muted")}>
                  {format(t.form.charCount, { count: question.length, max: ASK_MAX_QUESTION_CHARS })}
                </span>
              </div>
              <textarea
                id={ids.question}
                name="question"
                rows={5}
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  if (questionInvalid) setFieldError(null);
                }}
                placeholder={t.form.questionPlaceholder}
                aria-invalid={questionInvalid || undefined}
                aria-describedby={cn(ids.questionHint, questionInvalid && ids.questionError)}
                className={cn(controlClasses, "min-h-32 resize-y leading-relaxed", questionInvalid && "border-danger bg-danger-soft/40")}
              />
              <p id={ids.questionHint} className="text-xs text-muted">
                {t.form.questionHint}
              </p>
              {questionInvalid && (
                <p id={ids.questionError} className="text-xs font-semibold text-danger">
                  {fieldError.message}
                </p>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm font-semibold text-[#354b66]">
                {t.form.photoLabel} <span className="font-normal text-muted">{t.form.optional}</span>
              </p>
              {photo ? (
                <div className="flex flex-col gap-3 rounded-control border border-line bg-surface/50 p-3 sm:flex-row sm:items-start">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, never uploaded anywhere */}
                  <img
                    src={photo.previewUrl}
                    alt={t.form.photoPreviewAlt}
                    className="max-h-48 w-auto max-w-full self-start rounded-md border border-line bg-white object-contain sm:max-w-[45%]"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Camera aria-hidden="true" className="size-4" />
                      {t.form.changePhoto}
                    </Button>
                    <Button variant="outline" size="sm" onClick={removePhoto}>
                      <ImageOff aria-hidden="true" className="size-4" />
                      {t.form.removePhoto}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor={ids.photo}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-dashed border-[#b9cbe0] bg-white px-4 py-2.5 text-sm font-bold text-navy transition hover:border-blue",
                      "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue",
                      photoBusy && "pointer-events-none opacity-60",
                    )}
                  >
                    {photoBusy ? (
                      <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Camera aria-hidden="true" className="size-4" />
                    )}
                    {photoBusy ? t.form.photoPreparing : t.form.addPhoto}
                  </label>
                </div>
              )}
              <input
                ref={fileInputRef}
                id={ids.photo}
                type="file"
                accept="image/*"
                capture="environment"
                aria-label={t.form.photoLabel}
                aria-describedby={ids.photoHint}
                className="sr-only"
                onChange={(event) => void onPhotoChange(event.target.files?.[0])}
              />
              <p id={ids.photoHint} className="text-xs text-muted">
                {t.form.photoHint}
              </p>
              {photoError && (
                <p role="alert" className="text-xs font-semibold text-danger">
                  {photoError}
                </p>
              )}
              {photo && (
                <div className="flex flex-col gap-1">
                  <label htmlFor={ids.consent} className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
                    <input
                      id={ids.consent}
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => {
                        setConsent(event.target.checked);
                        if (consentInvalid) setFieldError(null);
                      }}
                      aria-invalid={consentInvalid || undefined}
                      aria-describedby={consentInvalid ? ids.consentError : undefined}
                      className="mt-0.5 size-5 shrink-0 accent-navy"
                    />
                    <span>{t.form.consentLabel}</span>
                  </label>
                  {consentInvalid && (
                    <p id={ids.consentError} className="text-xs font-semibold text-danger">
                      {fieldError.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            <p id={ids.privacy} className="rounded-control bg-surface px-3 py-2.5 text-xs leading-relaxed text-[#315475]">
              {t.form.privacyNote}{" "}
              <Link href={links.privacy} className="font-semibold underline">
                {t.form.privacyLink}
              </Link>
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <Button type="submit" disabled={notConnected || busy || photoBusy || limitReached}>
                {busy ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Send aria-hidden="true" className="size-4" />
                )}
                {busy ? t.form.sending : t.form.submit}
              </Button>
              {status && status.configured && (
                <p className="text-sm text-muted" aria-live="polite">
                  {status.remaining > 0
                    ? format(t.form.remaining, { remaining: status.remaining, limit: status.limit })
                    : t.form.remainingNone}
                </p>
              )}
            </div>
          </fieldset>
          {busy && (
            <Button variant="outline" size="sm" onClick={stopAnswer} className="mt-3">
              <Square aria-hidden="true" className="size-3.5" />
              {t.form.stop}
            </Button>
          )}
        </form>

        {status?.configured && status.account === "guest" && (
          <p className="mt-4 text-xs text-muted">
            {t.form.guestNote}{" "}
            <Link href={links.signIn} className="font-semibold text-blue underline">
              {t.form.signIn}
            </Link>
          </p>
        )}
        {status?.configured && status.account === "student" && <p className="mt-4 text-xs text-muted">{t.form.studentNote}</p>}

        {failureMessage && (
          <Notice variant="error" role="alert" className="mt-5">
            {failureMessage}
          </Notice>
        )}
      </div>

      <section
        ref={answerRef}
        aria-labelledby={ids.answerHeading}
        hidden={!showAnswer}
        className="mt-6 scroll-mt-24 rounded-card border border-line bg-white p-5 shadow-soft md:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={ids.answerHeading} className="text-xl font-extrabold text-navy">
            {t.answer.heading}
          </h2>
          {phase === "done" && answer && (
            <Button variant="light" size="sm" onClick={() => void copyAnswer()}>
              {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
              {copied ? t.answer.copied : t.answer.copy}
            </Button>
          )}
        </div>

        {meta && meta.subject !== "other" && (
          <dl className="mt-3 flex flex-wrap gap-2 text-xs">
            <div className="flex gap-1 rounded-md bg-blue-soft px-2 py-1 text-[#0755b5]">
              <dt className="font-semibold">{t.answer.subjectLabel}:</dt>
              <dd>{t.form.subjects[meta.subject]}</dd>
            </div>
            {meta.topic && (
              <div className="flex gap-1 rounded-md bg-blue-soft px-2 py-1 text-[#0755b5]" lang="en">
                <dt className="font-semibold">{t.answer.topicLabel}:</dt>
                <dd>{meta.topic}</dd>
              </div>
            )}
            {meta.difficulty && (
              <div className="flex gap-1 rounded-md bg-surface px-2 py-1 text-muted">
                <dt className="font-semibold">{t.answer.difficultyLabel}:</dt>
                <dd>{t.answer.difficulty[meta.difficulty]}</dd>
              </div>
            )}
          </dl>
        )}

        <div aria-busy={busy} className="mt-4">
          {busy && !answer && (
            <div className="flex items-start gap-3 rounded-control bg-surface p-4 text-sm text-[#315475]">
              <LoaderCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin text-blue motion-reduce:animate-none" />
              <div>
                <p className="font-semibold">{t.answer.working}</p>
                <p className="text-xs text-muted">{t.answer.workingHint}</p>
              </div>
            </div>
          )}
          {answer && (
            <div lang={answerLanguage === "hi" ? "hi" : "en"} className="font-sans">
              <AnswerContent text={answer} />
            </div>
          )}
        </div>

        {stop === "max_tokens" && (
          <Notice variant="warning" className="mt-4">
            {t.answer.truncated}
          </Notice>
        )}
        {stop === "refusal" && (
          <Notice variant="info" className="mt-4">
            {t.answer.refused}
          </Notice>
        )}
        {stop === "stopped" && <p className="mt-4 text-sm text-muted">{t.answer.stopped}</p>}

        {phase === "done" && answer && (
          <div className="mt-6 grid gap-4 border-t border-line pt-5">
            <p className="text-sm font-semibold text-[#8b5b00]">{t.answer.disclaimer}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-navy">{t.answer.helpfulQuestion}</span>
              {feedback ? (
                <span className="text-sm text-muted" role="status">
                  {t.answer.helpfulThanks}
                </span>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => giveFeedback("yes")}>
                    <ThumbsUp aria-hidden="true" className="size-4" />
                    {t.answer.helpfulYes}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => giveFeedback("no")}>
                    <ThumbsDown aria-hidden="true" className="size-4" />
                    {t.answer.helpfulNo}
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-control bg-gold-soft p-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-navy">{t.stuck.title}</p>
                <p className="text-sm text-[#5c4a12]">{t.stuck.body}</p>
              </div>
              <ButtonLink href={links.enquiry} size="sm">
                {t.stuck.cta}
              </ButtonLink>
            </div>
            <div>
              <Button variant="link" onClick={askAnother}>
                {t.answer.askAnother}
              </Button>
            </div>
          </div>
        )}
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {phase === "streaming" && !answer ? t.answer.working : phase === "done" && answer && stop !== "stopped" ? t.answer.ready : ""}
      </p>
    </div>
  );
}
