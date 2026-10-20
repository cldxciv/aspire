import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

import { resolveAsker, type Asker } from "@/lib/ask/asker";
import { createAskClient, streamAnswer, type AskModelInput } from "@/lib/ask/claude";
import { getAskConfig, type AskConfig } from "@/lib/ask/config";
import { ASK_MAX_BODY_BYTES, ASK_MAX_IMAGE_BYTES, type AskStatus, type AskStreamEvent } from "@/lib/ask/constants";
import { checkImage } from "@/lib/ask/image";
import { askExceptionCode, askLog, type AskLogEntry, type AskLogReason } from "@/lib/ask/log";
import { ASK_PROMPT_VERSION } from "@/lib/ask/prompt";
import { ASK_FIELD_MESSAGES, askFieldErrors, askRequestSchema, cleanQuestion } from "@/lib/ask/schema";
import { createTrailerFilter } from "@/lib/ask/trailer";
import { exhaustedAllowance, reserveQuestion, secondsUntilNextIstDay, usageStatus, type Reservation } from "@/lib/ask/usage";
import { recordDoubtTopic } from "@/lib/ask/weak-topics";
import { setSessionCookie } from "@/lib/auth/cookie";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem, privateApiHeaders } from "@/lib/auth/responses";
import { getCurrentSession, type CurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/connection";

/**
 * Rancho — the AI doubt solver, formerly "Ask Aspire" (D-035; docs/ask-aspire.md). Node runtime (the default).
 *
 * GET /api/ask → `{ ok, data: AskStatus }`: whether it is connected, and today's allowance.
 *
 * POST /api/ask — JSON ≤ ~5.6 MB: `{ question?, subject?, language, image?: { mediaType, data },
 * photoConsent? }`. Order: same-origin (403) → configured (503 `not_configured`) → allowance
 * already used up (429, checked before the body is read) → JSON body (415 / 413 / 400 / 422) →
 * photo re-checked by magic bytes, ≤ 4 MB (413 / 422) → daily allowance reserved (429 +
 * Retry-After) → Claude. Upstream failures before the answer starts: 503 (busy, or
 * `not_configured` for a rejected key) / 502, and the question is not counted. Otherwise 200 with
 * an NDJSON stream of `AskStreamEvent`s; the model's topic trailer is stripped from the text.
 *
 * Privacy: the photo lives in memory for this request only; nothing of the question, photo or
 * answer is stored or logged. Signed-in students get (subject, topic) counters for weak-topic
 * tracking; guests get nothing stored beyond a hashed per-day counter.
 */

const BUSY_MESSAGE = "Rancho is busy right now. Please try again in a minute.";
const NOT_CONFIGURED_MESSAGE = "Rancho isn't connected yet.";
const UPSTREAM_MESSAGE = "We couldn't answer this question. If you added a photo, try a clearer JPG or PNG.";
const SERVER_ERROR_MESSAGE = "Something went wrong. Please try again.";

function limitMessage(reservation: Extract<Reservation, { allowed: false }>, asker: Asker): string {
  if (reservation.reason === "global") return "Rancho has answered all the questions it can for today. Please try again tomorrow.";
  if (reservation.limit === 0) return "Rancho is not available for this account type right now.";
  return asker.account === "guest"
    ? `You've used today's ${reservation.limit} free questions. Sign in with your Aspire student account for more, or come back tomorrow.`
    : `You've used today's ${reservation.limit} questions. Please come back tomorrow.`;
}

function withSessionCookie<T extends NextResponse>(response: T, current: CurrentSession | null): T {
  if (current?.refreshed) setSessionCookie(response, current.token, current.expiresAt);
  return response;
}

function unexpected(error: unknown, entry: Omit<AskLogEntry, "outcome">) {
  unstable_rethrow(error);
  askLog({ ...entry, outcome: "error", reason: askExceptionCode(error) });
  return portalApiError("server_error", SERVER_ERROR_MESSAGE);
}

export async function GET(request: Request) {
  try {
    const config = getAskConfig();
    const current = await getCurrentSession();
    const asker = resolveAsker(current, request.headers, config);
    const now = Date.now();
    const usage = config.configured
      ? usageStatus(getDb(), { key: asker.key, limit: asker.limit, now })
      : { used: 0, remaining: asker.limit, resetsInSeconds: secondsUntilNextIstDay(now) };
    const status: AskStatus = {
      configured: config.configured,
      account: asker.account,
      limit: asker.limit,
      used: usage.used,
      remaining: usage.remaining,
      resetsInSeconds: usage.resetsInSeconds,
      maxImageBytes: ASK_MAX_IMAGE_BYTES,
    };
    return withSessionCookie(portalApiItem(status), current);
  } catch (error) {
    return unexpected(error, {});
  }
}

type UpstreamFailure = { response: NextResponse; reason: AskLogReason; aborted: boolean };

/** Maps a Claude API error that happened before any text was produced. */
function upstreamFailure(error: unknown): UpstreamFailure | null {
  if (error instanceof APIUserAbortError) {
    return { response: portalApiError("bad_request", "Request cancelled."), reason: "mid_stream", aborted: true };
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    // A missing, revoked or wrong key: the honest state for the student is "not connected".
    return { response: portalApiError("not_configured", NOT_CONFIGURED_MESSAGE), reason: "upstream_auth", aborted: false };
  }
  const busy = (reason: AskLogReason): UpstreamFailure => ({
    response: portalApiError("server_error", BUSY_MESSAGE, { status: 503, headers: { "Retry-After": "60" } }),
    reason,
    aborted: false,
  });
  if (error instanceof RateLimitError) return busy("upstream_rate_limit");
  if (error instanceof InternalServerError) return busy("upstream_overloaded");
  if (error instanceof APIConnectionError) return busy("upstream_connection");
  if (error instanceof APIError) {
    const reason: AskLogReason = error.status === 400 || error.status === 404 || error.status === 422 ? "upstream_bad_request" : "upstream_other";
    return { response: portalApiError("server_error", UPSTREAM_MESSAGE, { status: 502 }), reason, aborted: false };
  }
  return null;
}

function mapStop(reason: string | null | undefined): Extract<AskStreamEvent, { t: "done" }>["stop"] {
  return reason === "end_turn" || reason === "max_tokens" || reason === "refusal" ? reason : "other";
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const logBase: Omit<AskLogEntry, "outcome"> = { promptVersion: ASK_PROMPT_VERSION };
  let reservation: Extract<Reservation, { allowed: true }> | null = null;
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      askLog({ ...logBase, outcome: "forbidden", reason: crossOrigin.reason as AskLogReason | undefined });
      return crossOrigin.response;
    }

    const config: AskConfig = getAskConfig();
    if (!config.configured || !config.apiKey) {
      askLog({ ...logBase, outcome: "not_configured" });
      return portalApiError("not_configured", NOT_CONFIGURED_MESSAGE);
    }
    logBase.model = config.model;

    // Who is asking, and a cheap read-only allowance check BEFORE reading a body of up to ~5.6 MB
    // (QA-SEC-M6): an IP / account (or the site) with nothing left today is refused without
    // buffering and decoding a photo. reserveQuestion() below still decides atomically.
    const current = await getCurrentSession();
    const asker = resolveAsker(current, request.headers, config);
    logBase.account = asker.account;
    const exhausted = exhaustedAllowance(getDb(), {
      key: asker.key,
      limit: asker.limit,
      globalLimit: config.globalDaily,
      now: Date.now(),
    });
    if (exhausted) {
      askLog({ ...logBase, outcome: "rate_limited", reason: exhausted.limit === 0 ? "disabled" : exhausted.reason });
      return withSessionCookie(
        portalApiError("rate_limited", limitMessage(exhausted, asker), {
          headers: { "Retry-After": String(exhausted.retryAfterSeconds) },
        }),
        current,
      );
    }

    const parsed = await parseJsonBody(request, askRequestSchema, ASK_MAX_BODY_BYTES);
    if (!parsed.ok) {
      askLog({
        ...logBase,
        outcome: parsed.outcome === "validation_failed" ? "validation_failed" : "bad_request",
        reason: parsed.reason as AskLogReason | undefined,
      });
      return parsed.response;
    }
    const body = parsed.data;
    const question = cleanQuestion(body.question);
    logBase.image = Boolean(body.image);
    logBase.language = body.language;

    const fieldErrors = askFieldErrors(body, question);
    if (fieldErrors) {
      askLog({ ...logBase, outcome: "validation_failed", reason: fieldErrors.photoConsent ? "consent_missing" : "empty_question" });
      return portalApiError("validation", "Please check the highlighted fields.", { fieldErrors });
    }

    let image: AskModelInput["image"] = null;
    if (body.image) {
      const checked = checkImage(body.image.mediaType, body.image.data);
      if (!checked.ok) {
        askLog({ ...logBase, outcome: checked.reason === "image_too_large" ? "bad_request" : "validation_failed", reason: checked.reason });
        return checked.reason === "image_too_large"
          ? portalApiError("bad_request", ASK_FIELD_MESSAGES.imageTooLarge, { status: 413 })
          : portalApiError("validation", ASK_FIELD_MESSAGES.imageInvalid, { fieldErrors: { image: [ASK_FIELD_MESSAGES.imageInvalid] } });
      }
      image = { mediaType: checked.mediaType, base64: checked.base64 };
    }

    const reserved = reserveQuestion(getDb(), {
      key: asker.key,
      limit: asker.limit,
      globalLimit: config.globalDaily,
      now: Date.now(),
    });
    if (!reserved.allowed) {
      askLog({ ...logBase, outcome: "rate_limited", reason: reserved.limit === 0 ? "disabled" : reserved.reason });
      return withSessionCookie(
        portalApiError("rate_limited", limitMessage(reserved, asker), {
          headers: { "Retry-After": String(reserved.retryAfterSeconds) },
        }),
        current,
      );
    }
    reservation = reserved;

    // The upstream call is aborted through the response stream's cancel() when the browser goes
    // away (not via request.signal, whose timing around streamed responses is framework-specific).
    const stream = streamAnswer(createAskClient(config.apiKey, config.workspaceId), config, {
      question,
      subject: body.subject ?? "auto",
      language: body.language,
      image,
    });
    const events = stream[Symbol.asyncIterator]();

    // Wait for the first event so connection / key / rate-limit errors become a proper status.
    let first: IteratorResult<unknown>;
    try {
      first = await events.next();
    } catch (error) {
      const failure = upstreamFailure(error);
      if (!failure) throw error;
      if (!failure.aborted) reservation.release();
      reservation = null;
      askLog({
        ...logBase,
        outcome: failure.aborted ? "client_aborted" : "upstream_error",
        reason: failure.reason,
        durationMs: Date.now() - startedAt,
      });
      return failure.response;
    }

    const held = reservation;
    reservation = null; // from here the stream owns the reservation
    const encoder = new TextEncoder();
    const filter = createTrailerFilter();

    const pump = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
      let open = true;
      const send = (event: AskStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the browser went away
        }
      };
      let shown = false;
      send({ t: "start", remaining: held.remaining, limit: held.limit });
      try {
        let step = first as IteratorResult<{ type: string; delta?: { type: string; text?: string } }>;
        while (!step.done) {
          const event = step.value;
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            const visible = filter.push(event.delta.text);
            if (visible) {
              shown = true;
              send({ t: "delta", text: visible });
            }
          }
          step = (await events.next()) as typeof step;
        }
        const final = await stream.finalMessage();
        const { tail, meta } = filter.end();
        if (tail) send({ t: "delta", text: tail });
        const stop = mapStop(final.stop_reason);
        send({ t: "done", stop, meta: stop === "refusal" ? null : meta });

        if (asker.studentId && (stop === "end_turn" || stop === "max_tokens")) {
          try {
            recordDoubtTopic(asker.studentId, meta);
          } catch (error) {
            askLog({ ...logBase, outcome: "error", reason: askExceptionCode(error) });
          }
        }
        askLog({
          ...logBase,
          outcome: stop === "refusal" ? "refused" : stop === "max_tokens" ? "truncated" : "answered",
          durationMs: Date.now() - startedAt,
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          cacheReadTokens: final.usage.cache_read_input_tokens ?? undefined,
        });
      } catch (error) {
        const aborted = error instanceof APIUserAbortError || !open;
        if (!aborted && !shown) held.release();
        askLog({
          ...logBase,
          outcome: aborted ? "client_aborted" : "upstream_error",
          reason: aborted ? "mid_stream" : (upstreamFailure(error)?.reason ?? askExceptionCode(error)),
          durationMs: Date.now() - startedAt,
        });
        if (!aborted) send({ t: "error", code: shown ? "interrupted" : "upstream" });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // already closed / cancelled
          }
        }
      }
    };

    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        void pump(controller);
      },
      cancel() {
        stream.abort();
      },
    });

    const headers = privateApiHeaders({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    headers.set("Cache-Control", "no-store, no-transform");
    return withSessionCookie(new NextResponse(responseBody, { status: 200, headers }), current);
  } catch (error) {
    // Unexpected failure before the stream started: give the question back.
    reservation?.release();
    return unexpected(error, logBase);
  }
}
