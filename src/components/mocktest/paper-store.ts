import { newAttemptId, readProgress } from "@/lib/mocktest/local-store";
import { createRunnerState, type RunnerState } from "@/lib/mocktest/runner-state";
import type { Answer } from "@/lib/mocktest/scoring";
import type { PaperStart } from "@/lib/mocktest/types";
import { isQbSlot, type QbPaperRef, type QbPaperView, type QbSlot } from "@/lib/qb/types";
import { paperDeadline, paperLatestEnd } from "./paper-model";

/**
 * Browser storage of exam-pattern papers (QB-MOCKTEST-UI, docs/question-bank-plan.md §B14 package 5).
 * Client-only helpers around pure validators; every access is wrapped because storage can be blocked
 * (private windows, disabled site data) — callers must work without it.
 *
 * Keys (versioned, beside the fixed tests' keys in src/lib/mocktest/local-store.ts):
 * - aspire.mocktest.v1.activePaper.<slot>   the practice paper being taken (ids, its bearer token,
 *                                           which part), so a reload resumes the SAME paper
 * - aspire.mocktest.v1.activePaper.<slot>.ranked   the ranked paper being taken (kept apart, so
 *                                           starting a practice paper never hides it)
 * - aspire.mocktest.v1.progress.paper-<id>  answers and timer of one part (the runner's RunnerState)
 * - aspire.mocktest.v1.recentPapers         the last 5 papers {id, token}: a guest's next paper avoids
 *                                           their questions (POST /api/mocktest/papers `recent`)
 * - aspire.mocktest.v1.paperAttempts        submitted papers (newest first, at most 30), for results
 *
 * The bearer token of a practice paper is kept so this browser can resume, score and report on it;
 * it opens that paper only (never an account). Ranked papers have no token: the student's session
 * opens them.
 */

const PREFIX = "aspire.mocktest.v1";
export const RECENT_PAPERS_KEY = `${PREFIX}.recentPapers`;
export const PAPER_ATTEMPTS_KEY = `${PREFIX}.paperAttempts`;
export const MAX_RECENT_PAPERS = 5;
export const MAX_PAPER_ATTEMPTS = 30;
export const ACTIVE_PAPER_VERSION = 1;

const PAPER_ID = /^[A-Za-z0-9_-]{22}$/;
const PAPER_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const TEST_ID = /^bp-[a-z0-9-]{1,60}$/;

/** The storage key of a slot's active paper: practice "aspire.mocktest.v1.activePaper.jee-main", ranked "….jee-main.ranked". */
export function activePaperKey(slot: QbSlot, mode: "practice" | "ranked" = "practice"): string {
  return mode === "ranked" ? `${PREFIX}.activePaper.${slot}.ranked` : `${PREFIX}.activePaper.${slot}`;
}

/** The runner's progress id of one paper part (`readProgress` / `writeProgress` key suffix "paper-<id>"). */
export function paperProgressId(paperId: string): string {
  return `paper-${paperId}`;
}

export interface ActivePaperPart {
  id: string;
  testId: string;
  /** 1 or 2 for a part of the JEE Advanced pair, else null. */
  part: number | null;
  createdAt: number;
  durationMinutes: number;
  compensatoryMinutes: number;
  questionCount: number;
}

export interface ActivePaper {
  v: typeof ACTIVE_PAPER_VERSION;
  slot: QbSlot;
  mode: "practice" | "ranked";
  /** Practice papers: the bearer token (shared by the parts of a set). Ranked: null. */
  token: string | null;
  setId: string | null;
  language: "en" | "hi";
  parts: ActivePaperPart[];
  /** The part being taken (0-based). */
  current: number;
  /** Local attempt id of each submitted part, else null. */
  attempts: (string | null)[];
  /** Server clock − device clock (ms) measured when the paper was made or opened; 0 when close enough. */
  clockOffsetMs: number;
  /** When this browser stored it (device clock). */
  savedAt: number;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function isActivePart(value: unknown): value is ActivePaperPart {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<ActivePaperPart>;
  return (
    typeof p.id === "string" &&
    PAPER_ID.test(p.id) &&
    typeof p.testId === "string" &&
    TEST_ID.test(p.testId) &&
    (p.part === null || (typeof p.part === "number" && Number.isInteger(p.part) && p.part >= 1)) &&
    isFiniteNumber(p.createdAt) &&
    isFiniteNumber(p.durationMinutes) &&
    p.durationMinutes > 0 &&
    isFiniteNumber(p.compensatoryMinutes) &&
    p.compensatoryMinutes >= 0 &&
    typeof p.questionCount === "number" &&
    Number.isInteger(p.questionCount) &&
    p.questionCount > 0
  );
}

/** Validates an active paper read back from storage for `slot` (shape, ids, token and part pointers). */
export function isActivePaper(value: unknown, slot: QbSlot): value is ActivePaper {
  if (!value || typeof value !== "object") return false;
  const a = value as Partial<ActivePaper>;
  if (a.v !== ACTIVE_PAPER_VERSION || a.slot !== slot) return false;
  if (a.mode !== "practice" && a.mode !== "ranked") return false;
  if (a.mode === "practice" ? !(typeof a.token === "string" && PAPER_TOKEN.test(a.token)) : a.token !== null) return false;
  if (a.language !== "en" && a.language !== "hi") return false;
  if (!(a.setId === null || (typeof a.setId === "string" && a.setId.length > 0 && a.setId.length <= 64))) return false;
  if (!Array.isArray(a.parts) || a.parts.length === 0 || a.parts.length > 4 || !a.parts.every(isActivePart)) return false;
  if (typeof a.current !== "number" || !Number.isInteger(a.current) || a.current < 0 || a.current >= a.parts.length) return false;
  if (!Array.isArray(a.attempts) || a.attempts.length !== a.parts.length) return false;
  if (!a.attempts.every((x) => x === null || (typeof x === "string" && x.length >= 8 && x.length <= 64))) return false;
  return isFiniteNumber(a.clockOffsetMs) && isFiniteNumber(a.savedAt);
}

/** The active-paper record for a freshly made (or resumed ranked) paper. */
export function activePaperFromStart(
  start: Pick<PaperStart, "token" | "setId" | "papers">,
  input: { slot: QbSlot; mode: "practice" | "ranked"; language: "en" | "hi"; clockOffsetMs: number; now: number },
): ActivePaper {
  const parts: ActivePaperPart[] = start.papers.map((paper) => ({
    id: paper.id,
    testId: paper.testId,
    part: paper.setPart,
    createdAt: paper.createdAt,
    durationMinutes: paper.durationMinutes,
    compensatoryMinutes: paper.compensatoryMinutes,
    questionCount: paper.questionCount,
  }));
  return {
    v: ACTIVE_PAPER_VERSION,
    slot: input.slot,
    mode: input.mode,
    token: input.mode === "practice" ? start.token : null,
    setId: start.setId,
    language: input.language,
    parts,
    current: 0,
    attempts: parts.map(() => null),
    clockOffsetMs: input.clockOffsetMs,
    savedAt: input.now,
  };
}

/** After a part was submitted: its attempt id is kept and the next part (if any) becomes current. */
export function activeAfterSubmit(active: ActivePaper, attemptId: string): { active: ActivePaper; done: boolean } {
  const attempts = active.attempts.slice();
  attempts[active.current] = attemptId;
  const next = active.current + 1;
  if (next >= active.parts.length) return { active: { ...active, attempts }, done: true };
  return { active: { ...active, attempts, current: next }, done: false };
}

/** Newest first, one entry per paper id, at most `max` (the request schema allows 5). Pure. */
export function addRecentPaper(list: readonly QbPaperRef[], ref: QbPaperRef, max: number = MAX_RECENT_PAPERS): QbPaperRef[] {
  if (!PAPER_ID.test(ref.id) || !PAPER_TOKEN.test(ref.token)) return list.slice(0, max);
  return [ref, ...list.filter((r) => r.id !== ref.id)].slice(0, max);
}

/** Only well-formed references survive a read (a malformed list would make the server ignore `recent`). */
export function validRecentPapers(value: unknown): QbPaperRef[] {
  if (!Array.isArray(value)) return [];
  const out: QbPaperRef[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { id, token } = item as Partial<QbPaperRef>;
    if (typeof id === "string" && PAPER_ID.test(id) && typeof token === "string" && PAPER_TOKEN.test(token) && !out.some((r) => r.id === id)) {
      out.push({ id, token });
    }
  }
  return out.slice(0, MAX_RECENT_PAPERS);
}

/** A submitted part, kept on this device (the server scores it; this only remembers the answers). */
export interface PaperLocalAttempt {
  /** Client attempt id (also sent to the server to de-duplicate saves). */
  id: string;
  slot: QbSlot;
  testId: string;
  paperId: string;
  setId: string | null;
  part: number | null;
  mode: "practice" | "ranked";
  /** Practice papers: the bearer token. Ranked: null. */
  token: string | null;
  language: "en" | "hi";
  answers: Answer[];
  timeSpentSec: number[];
  startedAt: number;
  submittedAt: number;
  submitReason: "manual" | "timeout";
  /** The paper's own facts, for the expired-paper fallback. */
  questionCount: number;
  maxScore: number;
  durationMinutes: number;
  compensatoryMinutes: number;
  /** Filled in after the server scored it. */
  score?: number;
  /** Server attempt id once saved to the student's account. */
  savedId?: string;
}

export function isPaperLocalAttempt(value: unknown): value is PaperLocalAttempt {
  if (!value || typeof value !== "object") return false;
  const a = value as Partial<PaperLocalAttempt>;
  return (
    typeof a.id === "string" &&
    a.id.length >= 8 &&
    isQbSlot(a.slot) &&
    typeof a.testId === "string" &&
    TEST_ID.test(a.testId) &&
    typeof a.paperId === "string" &&
    PAPER_ID.test(a.paperId) &&
    (a.mode === "practice" || a.mode === "ranked") &&
    (a.token === null || (typeof a.token === "string" && PAPER_TOKEN.test(a.token))) &&
    Array.isArray(a.answers) &&
    Array.isArray(a.timeSpentSec) &&
    a.answers.length === a.timeSpentSec.length &&
    isFiniteNumber(a.startedAt) &&
    isFiniteNumber(a.submittedAt) &&
    isFiniteNumber(a.maxScore) &&
    isFiniteNumber(a.questionCount)
  );
}

// ---------------------------------------------------------------------------------------------
// Storage (client only)

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Storage blocked: nothing to remove.
  }
}

export function readActivePaper(slot: QbSlot, mode: "practice" | "ranked" = "practice"): ActivePaper | null {
  const value = read(activePaperKey(slot, mode));
  return isActivePaper(value, slot) && value.mode === mode ? value : null;
}

export function writeActivePaper(paper: ActivePaper): boolean {
  return write(activePaperKey(paper.slot, paper.mode), paper);
}

export function clearActivePaper(slot: QbSlot, mode: "practice" | "ranked" = "practice"): void {
  remove(activePaperKey(slot, mode));
}

export function readRecentPapers(): QbPaperRef[] {
  return validRecentPapers(read(RECENT_PAPERS_KEY));
}

export function rememberRecentPaper(ref: QbPaperRef): void {
  write(RECENT_PAPERS_KEY, addRecentPaper(readRecentPapers(), ref));
}

export function listPaperAttempts(): PaperLocalAttempt[] {
  const value = read(PAPER_ATTEMPTS_KEY);
  return Array.isArray(value) ? value.filter(isPaperLocalAttempt) : [];
}

export function getPaperAttempt(id: string): PaperLocalAttempt | null {
  return listPaperAttempts().find((a) => a.id === id) ?? null;
}

export function addPaperAttempt(attempt: PaperLocalAttempt): boolean {
  const others = listPaperAttempts().filter((a) => a.id !== attempt.id);
  return write(PAPER_ATTEMPTS_KEY, [attempt, ...others].slice(0, MAX_PAPER_ATTEMPTS));
}

export function updatePaperAttempt(id: string, patch: Partial<Omit<PaperLocalAttempt, "id">>): void {
  const list = listPaperAttempts();
  const index = list.findIndex((a) => a.id === id);
  if (index === -1) return;
  list[index] = { ...list[index], ...patch };
  write(PAPER_ATTEMPTS_KEY, list);
}

/** The other parts of the same set on this device (JEE Advanced Paper 1 / Paper 2), in part order. */
export function setSiblings(attempt: Pick<PaperLocalAttempt, "setId">, all: readonly PaperLocalAttempt[]): PaperLocalAttempt[] {
  if (!attempt.setId) return [];
  return all.filter((a) => a.setId === attempt.setId).sort((a, b) => (a.part ?? 0) - (b.part ?? 0));
}

/**
 * The runner state of one paper part: resumed from this device, or new. The deadline is the SERVER's
 * (`paperDeadline`), converted to this device's clock with `active.clockOffsetMs` — measured when the
 * paper was made or, on a resume, just now when it was opened — so a reload, a closed tab or a device
 * clock moved after the start never adds time:
 * - a new part: the server's deadline;
 * - a resumed paper (or Paper 1): exactly its server end (it depends on server facts only);
 * - a resumed later part of a set: its saved deadline, never later than the server's latest end.
 */
export function initialPaperState(paper: Pick<QbPaperView, "id" | "createdAt" | "durationMinutes" | "compensatoryMinutes" | "questions">, active: ActivePaper, now: number): RunnerState {
  const progressId = paperProgressId(paper.id);
  const offset = active.clockOffsetMs;
  const earlier = active.parts.slice(0, active.current);
  const timing = { createdAt: paper.createdAt, durationMinutes: paper.durationMinutes, compensatoryMinutes: paper.compensatoryMinutes };
  const saved = readProgress(progressId, paper.questions.length);
  if (saved) {
    const latest = paperLatestEnd(timing, earlier) - offset;
    const deadline = earlier.length === 0 ? latest : Math.min(saved.deadline, latest);
    return deadline === saved.deadline ? saved : { ...saved, deadline };
  }
  const serverDeadline = paperDeadline(timing, { startedAt: now + offset, earlier });
  const state = createRunnerState({ testId: progressId, attemptId: newAttemptId(), questionCount: paper.questions.length, durationMinutes: 0, now });
  return { ...state, deadline: Math.max(now, serverDeadline - offset) };
}
