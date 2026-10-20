import type { AskFailure } from "@/components/ask/ask-client";
import type { LeadGateOpenVia } from "@/components/lead-gate/lead-gate-store";
import type { RanchoToolContext } from "@/lib/ask/cards";
import type { AskAccess, AskLanguage, AskSubjectHint } from "@/lib/ask/constants";
import type { LeadGateMode } from "@/lib/lead-gate/contract";

import type { RanchoQuestion } from "./rancho-chat";
import type { RanchoPhoto } from "./rancho-photo";

/**
 * Rancho behind the lead gate (docs/lead-gate-plan.md §8.6 and §5.6): the pure decisions the chat
 * (RanchoChat: the Ask page, /rancho and the floating panel) makes, unit-tested in rancho-gate.test.ts.
 *
 * A browser that hasn't shared contact details yet (and isn't signed in) gets the contact form
 * under its question instead of an answer. The question and its photo are HELD in memory (never
 * in storage), with the composer disabled, until:
 *  - this chat's own form unlocks the gate → the question is resent once, automatically;
 *  - the gate opens elsewhere (another tab, or another tool's form on this page) → "Send now";
 *  - "New chat" → the held question is dropped.
 * If the server still refuses it right after this chat's form got a pass, the form comes back with
 * a line saying the browser didn't keep it (cookies may be blocked).
 * Sample data does not skip the gate (owner decision, 21 Oct 2026): the form itself says so.
 */

/** A question that waits for the lead gate, with everything needed to send it again. */
export interface RanchoHeldQuestion {
  /** Its turn in the conversation (shown as the student's message, phase "held"). */
  turnId: number;
  /** Trimmed; empty for a photo-only question. */
  question: string;
  subject: AskSubjectHint;
  language: AskLanguage;
  /** The prepared photo itself (the turn only keeps its preview URL). */
  photo: RanchoPhoto | null;
  /** The "no faces or names" box was ticked (only meaningful with a photo). */
  photoConsent: boolean;
  toolContext: RanchoToolContext | null;
  /** Asked with the microphone: in voice mode its answer is read aloud. */
  spoken: boolean;
  /** Already resent once automatically: if it is refused again, the next unlock offers "Send now". */
  autoResent: boolean;
  /**
   * Sent (or offered again) right after THIS chat's form shared details and got a pass: a gate 401
   * now means the browser did not keep the pass (`ranchoGateNotice`).
   */
  afterOwnPass: boolean;
}

/** The `askRancho` input for a held (or new) question: the photo's consent only with a photo. */
export function heldQuestionInput(held: RanchoHeldQuestion): RanchoQuestion {
  return {
    question: held.question,
    subject: held.subject,
    language: held.language,
    photo: held.photo,
    photoConsent: held.photo ? held.photoConsent : undefined,
    toolContext: held.toolContext,
  };
}

/**
 * Before a question is POSTed:
 * - "send": the page's gate is open (off, signed in, details shared, a remembered skip) or could
 *   not be checked (fail-open: the server still answers with its gate 401 if it must);
 * - "wait": the gate is locked; `useLeadGate().requestAccess()` has already opened its form;
 * - "require": the gate's own status could not be read, but `GET /api/ask` already said this
 *   browser must share details first (`access: "gate_required"`): hold the question and open the
 *   form (`markRequired()`) instead of sending a question, and maybe a photo, only to be refused.
 *   That answer may be stale (another tab may have shared details since), so the chat first asks
 *   the gate's status once more (`store.refresh()`) and decides again; it holds only if that still
 *   can't be read or says locked (a hold also forgets the local hint other tabs share).
 */
export function ranchoGatePreflight(input: {
  /** `await useLeadGate().requestAccess()`. */
  allowed: boolean;
  /** `AskStatus.access` from the latest `GET /api/ask` (absent before it loads or from an older server). */
  access: AskAccess | undefined;
  /** The gate store's `via` after `requestAccess()`. */
  via: LeadGateOpenVia | null;
}): "send" | "wait" | "require" {
  if (!input.allowed) return "wait";
  if (input.access === "gate_required" && input.via === "unavailable") return "require";
  return "send";
}

/** The server refused with its gate 401 (`X-Lead-Gate: required`): nothing was read or counted. */
export function isGateFailure(failure: AskFailure | null | undefined): boolean {
  return failure?.kind === "gate";
}

/**
 * The gate opened while a question was held (useLeadGate's `onUnlocked`): resend it automatically
 * only when THIS chat's form (or its "Continue without sharing") opened it, and only once per
 * question; otherwise (another tab, another tool, a second time) offer "Send now" (critique 1.15).
 * The returned question records whether this chat's form has just shared details and got a pass
 * (`afterOwnPass`): if the server still refuses it, the browser did not keep the pass.
 */
export function ranchoGateUnlock(
  held: RanchoHeldQuestion,
  info: { byThisHost: boolean; via: LeadGateOpenVia | null },
): { action: "resend" | "offer"; question: RanchoHeldQuestion } {
  const afterOwnPass = info.byThisHost && info.via === "pass";
  if (info.byThisHost && !held.autoResent) return { action: "resend", question: { ...held, autoResent: true, afterOwnPass } };
  return { action: "offer", question: { ...held, afterOwnPass } };
}

/** The chat's own lead-gate state: the held question, and whether "Send now" is offered for it. */
export interface RanchoGateState {
  /** The question waiting for the lead gate (its turn is the last one, phase "held"), or null. */
  held: RanchoHeldQuestion | null;
  /** The gate opened while it waited and it was not resent automatically: offer "Send now". */
  ready: boolean;
}

export const RANCHO_GATE_IDLE: RanchoGateState = Object.freeze({ held: null, ready: false });

export type RanchoGateEvent =
  /**
   * The gate refused the question (locked, or the server's gate 401). `gateIsOpen`: the page's gate
   * had already opened again by then (another tab, in that instant): offer "Send now" at once, so a
   * held question never sits with nothing to press.
   */
  | { type: "hold"; question: RanchoHeldQuestion; gateIsOpen: boolean }
  /** The gate opened elsewhere (or a second time): "Send now" for this (updated) question. */
  | { type: "offer"; question: RanchoHeldQuestion }
  /** It is sent again (automatically or "Send now"): it leaves the hold. */
  | { type: "send" }
  /** "New chat" or the chat going away. */
  | { type: "drop" };

export function ranchoGateReducer(state: RanchoGateState, event: RanchoGateEvent): RanchoGateState {
  switch (event.type) {
    case "hold":
      return { held: event.question, ready: event.gateIsOpen };
    case "offer":
      return state.held?.turnId === event.question.turnId ? { held: event.question, ready: true } : state;
    case "send":
    case "drop":
      return RANCHO_GATE_IDLE;
  }
}

/**
 * What sits under a held question: the contact form while the page's gate asks for it
 * (`useLeadGate().gateOpen`), else "Send now" once offered. Null only for the one render between the
 * gate opening (the store updates first) and `onUnlocked` resending the question or offering "Send now".
 */
export function ranchoGateView(state: RanchoGateState, gateOpen: boolean): "form" | "ready" | null {
  if (!state.held) return null;
  if (gateOpen) return "form";
  return state.ready ? "ready" : null;
}

/**
 * A line above the form: the server refused the question right after this chat's form shared
 * details and got a pass, so the browser did not keep it (cookies blocked, or the pass rejected).
 * Without it the family would go round the same form with no explanation.
 */
export function ranchoGateNotice(state: RanchoGateState, view: ReturnType<typeof ranchoGateView>): "notKept" | null {
  return view === "form" && state.held?.afterOwnPass ? "notKept" : null;
}

/** What the live region says when a question is held (`rancho.panel.gate` key). */
export function ranchoHoldAnnouncement(
  question: Pick<RanchoHeldQuestion, "afterOwnPass">,
  gate: { gateIsOpen: boolean; mode: LeadGateMode | null },
): "unlocked" | "notKept" | "formShown" | "formShownOptional" {
  if (gate.gateIsOpen) return "unlocked";
  if (question.afterOwnPass) return "notKept";
  return gate.mode === "optional" ? "formShownOptional" : "formShown";
}
