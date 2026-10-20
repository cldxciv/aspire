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

import { askerUsageKeys, resolveAsker, type Asker } from "@/lib/ask/asker";
import { createAskClient, startAskConversation, type AskConversationResult, type AskLoopEvent, type AskModelInput } from "@/lib/ask/claude";
import { getAskConfig, type AskConfig } from "@/lib/ask/config";
import {
  ASK_MAX_BODY_BYTES,
  ASK_MAX_IMAGE_BYTES,
  type AskAccess,
  type AskAnswerMeta,
  type AskStatus,
  type AskStreamEvent,
} from "@/lib/ask/constants";
import { checkImage } from "@/lib/ask/image";
import { askExceptionCode, askLog, type AskLogEntry, type AskLogReason } from "@/lib/ask/log";
import { ASK_PROMPT_VERSION } from "@/lib/ask/prompt";
import { ASK_FIELD_MESSAGES, askFieldErrors, askRequestSchema, cleanQuestion, cleanToolContext } from "@/lib/ask/schema";
import { createTrailerFilter } from "@/lib/ask/trailer";
import { exhaustedAllowance, reserveQuestion, secondsUntilNextIstDay, usageStatus, type Reservation } from "@/lib/ask/usage";
import { recordDoubtTopic } from "@/lib/ask/weak-topics";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem, privateApiHeaders } from "@/lib/auth/responses";
import { getDb } from "@/lib/db/connection";
import {
  applyLeadGateCookies,
  leadGateRequiredResponse,
  recordLeadGateToolUse,
  resolveLeadGateAccess,
  type LeadGateAccess,
} from "@/lib/lead-gate/server";

/**
 * Rancho — the AI doubt solver, formerly "Ask Aspire" (D-035; docs/ask-aspire.md). Node runtime (the default).
 *
 * GET /api/ask → `{ ok, data: AskStatus }`: whether it is connected, the lead gate for this
 * browser (`access`: open | gate_required | gate_optional) and today's allowance (`remaining` is 0
 * once the site-wide daily cap is reached as well).
 *
 * POST /api/ask — JSON ≤ ~5.6 MB: `{ question?, subject?, language, image?: { mediaType, data },
 * photoConsent?, toolContext?: { tool, summary } }`. Order: same-origin (403) → configured (503 `not_configured`) →
 * lead gate (docs/lead-gate-plan.md §5.6: with LEAD_GATE=required, a guest browser that has not
 * shared contact details yet gets the gate 401 — code `unauthenticated`, header
 * `X-Lead-Gate: required`, body `gate: "lead"` — before anything is read, reserved or counted;
 * signed-in accounts and browsers with a pass go on) → allowance already used up (429, checked
 * before the body is read; a pass holder is charged per IP AND per family) → JSON body (415 / 413 / 400 / 422) →
 * photo re-checked by magic bytes, ≤ 4 MB (413 / 422) → daily allowance reserved (429 +
 * Retry-After) → Claude. Upstream failures before the answer starts: 503 (busy, or
 * `not_configured` for a rejected key) / 502, and the question is not counted. Otherwise 200 with
 * an NDJSON stream of `AskStreamEvent`s; the model's topic trailer is stripped from the text.
 * Rancho may use Aspire's tools while answering (src/lib/ask/tools.ts, at most 3 calls): each
 * successful result is streamed as a `card` event before the text that discusses it. One
 * question is one allowance unit however many model turns it takes; the logged token counts are
 * summed over all turns (on a failure part-way: over the turns that finished). The trailer is
 * stripped per model turn, so one written before a tool call cannot hide the later answer.
 *
 * Rancho's in-chat tools (predict_rank, find_mock_tests, …) run only inside an answered POST, so
 * the gate covers their cards too.
 *
 * Privacy: the photo lives in memory for this request only; nothing of the question, photo or
 * answer is stored or logged. Signed-in students get (subject, topic) counters for weak-topic
 * tracking. Guests get a hashed per-day counter; a browser whose family shared contact details
 * (a lead-gate pass that records use) also gets ONE note per day on the family's admission record
 * that Rancho was used — never the question, its subject or topic, the answer or a photo flag.
 */

const BUSY_MESSAGE = "Rancho is busy right now. Please try again in a minute.";
/** The gate 401's English `message` (the UI shows its own localised `leadGate` copy). */
const GATE_MESSAGE = "Share a contact number once to get answers from Rancho.";
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

/** The lead gate as the Rancho UIs see it (plan §5.6). */
function askAccess(gate: LeadGateAccess): AskAccess {
  if (gate.unlocked) return "open";
  return gate.mode === "required" ? "gate_required" : "gate_optional";
}

/** Who is asking on this request; a pass holder is also charged to the family (critique 1.3). */
function askerFor(gate: LeadGateAccess, request: Request, config: AskConfig): Asker {
  return resolveAsker(gate.session, request.headers, config, gate.via === "pass" ? gate.pass : null);
}

function unexpected(error: unknown, entry: Omit<AskLogEntry, "outcome">) {
  unstable_rethrow(error);
  askLog({ ...entry, outcome: "error", reason: askExceptionCode(error) });
  return portalApiError("server_error", SERVER_ERROR_MESSAGE);
}

export async function GET(request: Request) {
  let gate: LeadGateAccess | null = null;
  try {
    const config = getAskConfig();
    gate = await resolveLeadGateAccess();
    const asker = askerFor(gate, request, config);
    const now = Date.now();
    // `remaining` is 0 once the site-wide cap is reached too, so the chat shows "that's all for
    // today" instead of asking a family for contact details before a question that would be refused.
    const usage = config.configured
      ? usageStatus(getDb(), { ...askerUsageKeys(asker), limit: asker.limit, globalLimit: config.globalDaily, now })
      : { used: 0, remaining: asker.limit, resetsInSeconds: secondsUntilNextIstDay(now) };
    const status: AskStatus = {
      configured: config.configured,
      access: askAccess(gate),
      account: asker.account,
      limit: asker.limit,
      used: usage.used,
      remaining: usage.remaining,
      resetsInSeconds: usage.resetsInSeconds,
      maxImageBytes: ASK_MAX_IMAGE_BYTES,
    };
    return applyLeadGateCookies(portalApiItem(status), gate);
  } catch (error) {
    const response = unexpected(error, {});
    return gate ? applyLeadGateCookies(response, gate) : response;
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
  // Set once the lead gate is resolved: every later response re-issues a refreshed session cookie
  // and clears a dead pass cookie (plan §5.6 step 8).
  let gate: LeadGateAccess | null = null;
  const respond = <T extends NextResponse>(response: T): T => (gate ? applyLeadGateCookies(response, gate) : response);
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

    // Lead gate (plan §5.6), BEFORE the allowance and the body: a browser that must share contact
    // details first gets the gate 401 without its (up to ~5.6 MB) body being read and without
    // anything being reserved or counted. It also resolves the session (one lookup per request).
    const access = await resolveLeadGateAccess();
    gate = access;
    if (access.enforce) {
      askLog({ ...logBase, outcome: "gate_required", account: "guest" });
      return respond(leadGateRequiredResponse(GATE_MESSAGE));
    }

    // Who is asking, and a cheap read-only allowance check BEFORE reading a body of up to ~5.6 MB
    // (QA-SEC-M6): an IP / account / family (or the site) with nothing left today is refused
    // without buffering and decoding a photo. reserveQuestion() below still decides atomically.
    const asker = askerFor(access, request, config);
    const usageKeys = askerUsageKeys(asker);
    logBase.account = asker.account;
    const exhausted = exhaustedAllowance(getDb(), {
      ...usageKeys,
      limit: asker.limit,
      globalLimit: config.globalDaily,
      now: Date.now(),
    });
    if (exhausted) {
      askLog({ ...logBase, outcome: "rate_limited", reason: exhausted.limit === 0 ? "disabled" : exhausted.reason });
      return respond(
        portalApiError("rate_limited", limitMessage(exhausted, asker), {
          headers: { "Retry-After": String(exhausted.retryAfterSeconds) },
        }),
      );
    }

    const parsed = await parseJsonBody(request, askRequestSchema, ASK_MAX_BODY_BYTES);
    if (!parsed.ok) {
      askLog({
        ...logBase,
        outcome: parsed.outcome === "validation_failed" ? "validation_failed" : "bad_request",
        reason: parsed.reason as AskLogReason | undefined,
      });
      return respond(parsed.response);
    }
    const body = parsed.data;
    const question = cleanQuestion(body.question);
    const toolContext = cleanToolContext(body.toolContext);
    logBase.image = Boolean(body.image);
    logBase.language = body.language;
    if (toolContext) logBase.fromTool = toolContext.tool;

    const fieldErrors = askFieldErrors(body, question);
    if (fieldErrors) {
      askLog({ ...logBase, outcome: "validation_failed", reason: fieldErrors.photoConsent ? "consent_missing" : "empty_question" });
      return respond(portalApiError("validation", "Please check the highlighted fields.", { fieldErrors }));
    }

    let image: AskModelInput["image"] = null;
    if (body.image) {
      const checked = checkImage(body.image.mediaType, body.image.data);
      if (!checked.ok) {
        askLog({ ...logBase, outcome: checked.reason === "image_too_large" ? "bad_request" : "validation_failed", reason: checked.reason });
        return respond(
          checked.reason === "image_too_large"
            ? portalApiError("bad_request", ASK_FIELD_MESSAGES.imageTooLarge, { status: 413 })
            : portalApiError("validation", ASK_FIELD_MESSAGES.imageInvalid, { fieldErrors: { image: [ASK_FIELD_MESSAGES.imageInvalid] } }),
        );
      }
      image = { mediaType: checked.mediaType, base64: checked.base64 };
    }

    const reserved = reserveQuestion(getDb(), {
      ...usageKeys,
      limit: asker.limit,
      globalLimit: config.globalDaily,
      now: Date.now(),
    });
    if (!reserved.allowed) {
      askLog({ ...logBase, outcome: "rate_limited", reason: reserved.limit === 0 ? "disabled" : reserved.reason });
      return respond(
        portalApiError("rate_limited", limitMessage(reserved, asker), {
          headers: { "Retry-After": String(reserved.retryAfterSeconds) },
        }),
      );
    }
    reservation = reserved;

    // The upstream calls are aborted through the response stream's cancel() when the browser goes
    // away (not via request.signal, whose timing around streamed responses is framework-specific).
    const conversation = startAskConversation(createAskClient(config.apiKey, config.workspaceId), config, {
      question,
      subject: body.subject ?? "auto",
      language: body.language,
      image,
      toolContext,
    });
    const events = conversation.events;

    // Wait for the first event so connection / key / rate-limit errors become a proper status.
    let first: IteratorResult<AskLoopEvent, AskConversationResult>;
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
      return respond(failure.response);
    }

    const held = reservation;
    reservation = null; // from here the stream owns the reservation
    const encoder = new TextEncoder();

    const pump = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
      let open = true;
      const send = (event: AskStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the browser went away
          conversation.abort();
        }
      };
      // Text or a card reached the student (a later failure then no longer gives the question back).
      let shown = false;
      // One trailer filter per model turn: a trailer the model wrote before a tool call must not
      // swallow the answer of a later turn. The last turn that had a trailer gives the meta.
      let filter = createTrailerFilter();
      let meta: AskAnswerMeta | null = null;
      let textSent = false;
      let turnEnded = false;
      const sendText = (text: string) => {
        if (!text) return;
        // Text written before a tool call and the next turn's text are separate paragraphs.
        const separated = turnEnded && textSent ? `\n\n${text}` : text;
        turnEnded = false;
        textSent = true;
        shown = true;
        send({ t: "delta", text: separated });
      };
      const closeTurn = () => {
        const ended = filter.end();
        sendText(ended.tail);
        if (ended.meta) meta = ended.meta;
        filter = createTrailerFilter();
      };
      send({ t: "start", remaining: held.remaining, limit: held.limit });
      try {
        let step = first;
        while (!step.done) {
          const event = step.value;
          if (event.kind === "text") {
            sendText(filter.push(event.text));
          } else if (event.kind === "turn_end") {
            closeTurn();
            turnEnded = true;
          } else if (event.kind === "card") {
            shown = true;
            send({ t: "card", card: event.card });
          }
          step = await events.next();
        }
        const final = step.value;
        closeTurn();
        const stop = mapStop(final.stop);
        send({ t: "done", stop, meta: stop === "refusal" ? null : meta });

        if (stop === "end_turn" || stop === "max_tokens") {
          if (asker.studentId) {
            try {
              recordDoubtTopic(asker.studentId, meta);
            } catch (error) {
              askLog({ ...logBase, outcome: "error", reason: askExceptionCode(error) });
            }
          }
          // Lead gate (plan §5.6 step 7): on a counted answer, note on the family's record ONLY that
          // Rancho was used (merged per day). Nothing for sessions, the gate off, or a pass that does
          // not record use; never the question, subject, topic, answer or a photo flag. Refusals,
          // upstream errors and aborts never get here.
          try {
            recordLeadGateToolUse(access, { tool: "ask", key: "rancho" });
          } catch (error) {
            // It logs and swallows database errors itself; this only guards the finished stream.
            askLog({ ...logBase, outcome: "error", reason: askExceptionCode(error) });
          }
        }
        askLog({
          ...logBase,
          outcome: stop === "refusal" ? "refused" : stop === "max_tokens" ? "truncated" : "answered",
          durationMs: Date.now() - startedAt,
          inputTokens: final.usage.inputTokens,
          outputTokens: final.usage.outputTokens,
          cacheReadTokens: final.usage.cacheReadTokens,
          toolCalls: final.toolCalls,
          modelTurns: final.turns,
        });
      } catch (error) {
        const aborted = error instanceof APIUserAbortError || !open;
        if (!aborted && !shown) held.release();
        // Earlier finished turns were billed even though this one failed: log what is known.
        const progress = conversation.progress();
        askLog({
          ...logBase,
          outcome: aborted ? "client_aborted" : "upstream_error",
          reason: aborted ? "mid_stream" : (upstreamFailure(error)?.reason ?? askExceptionCode(error)),
          durationMs: Date.now() - startedAt,
          inputTokens: progress.usage.inputTokens,
          outputTokens: progress.usage.outputTokens,
          cacheReadTokens: progress.usage.cacheReadTokens,
          toolCalls: progress.toolCalls,
          modelTurns: progress.turns,
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
        conversation.abort();
      },
    });

    const headers = privateApiHeaders({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    headers.set("Cache-Control", "no-store, no-transform");
    return respond(new NextResponse(responseBody, { status: 200, headers }));
  } catch (error) {
    // Unexpected failure before the stream started: give the question back.
    reservation?.release();
    return respond(unexpected(error, logBase));
  }
}
