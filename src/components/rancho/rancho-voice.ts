import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import type { AskLanguage } from "@/lib/ask/constants";

/**
 * Voice for the Rancho chat (pure helpers, unit-tested; the hooks are in useRanchoVoice.ts):
 *
 * - 🎤 speech-to-text with the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). The
 *   browser does the recognition: in Chrome its speech service (Google) turns the audio into text, so
 *   Aspire never receives audio, only the text the student then reviews and sends.
 * - 🔊 "Listen" with `speechSynthesis`, preferring a voice that runs on the device. Answers are
 *   Markdown with Unicode maths (x², √, π, →…), occasionally LaTeX, so `speakableText()` turns them
 *   into words first ("v² = u² + 2as" → "v squared equals u squared plus 2as").
 *
 * Feature detection only; where the APIs are missing the buttons are simply not shown.
 */

export type RanchoSpeechWords = Messages<"rancho">["panel"]["voice"]["say"];

/** BCP 47 tag for recognition and speech: Indian English or Hindi. */
export function speechLang(language: AskLanguage): "en-IN" | "hi-IN" {
  return language === "hi" ? "hi-IN" : "en-IN";
}

// ---------------------------------------------------------------------------
// Speech recognition (not in TypeScript's DOM lib: Chrome / Edge / Safari ship it prefixed)
// ---------------------------------------------------------------------------

export interface RecognitionAlternativeLike {
  transcript: string;
}
export interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternativeLike;
}
export interface RecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: RecognitionResultLike;
}
export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: RecognitionResultListLike }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => RecognitionLike;

/** The speech recognition constructor, or null where the browser has none (e.g. Firefox). */
export function speechRecognitionCtor(scope: unknown = typeof window === "undefined" ? undefined : window): RecognitionCtor | null {
  if (!scope || typeof scope !== "object") return null;
  const candidate =
    (scope as { SpeechRecognition?: unknown }).SpeechRecognition ?? (scope as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  return typeof candidate === "function" ? (candidate as RecognitionCtor) : null;
}

/** True where answers can be read aloud (`speechSynthesis` + `SpeechSynthesisUtterance`). */
export function canSpeak(scope: unknown = typeof window === "undefined" ? undefined : window): boolean {
  if (!scope || typeof scope !== "object") return false;
  const s = scope as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown };
  return typeof s.speechSynthesis === "object" && s.speechSynthesis !== null && typeof s.SpeechSynthesisUtterance === "function";
}

/** Everything heard so far (final and interim parts), as one line of text. */
export function joinTranscript(results: RecognitionResultListLike): string {
  let text = "";
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result && result.length > 0) text += result[0].transcript;
  }
  return text.replace(/\s+/g, " ").trim();
}

/** The composer's text with what was heard appended (what the student had typed stays first). */
export function withTranscript(base: string, heard: string): string {
  const before = base.replace(/\s+$/, "");
  const spoken = heard.trim();
  if (!spoken) return base;
  return before ? `${before} ${spoken}` : spoken;
}

export type VoiceProblem = "denied" | "no_speech" | "no_mic" | "network" | "other";

/** Maps a `SpeechRecognitionErrorEvent.error` code; null for a deliberate stop. */
export function recognitionProblem(code: string): VoiceProblem | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "denied";
    case "no-speech":
      return "no_speech";
    case "audio-capture":
      return "no_mic";
    case "network":
      return "network";
    default:
      return "other";
  }
}

// ---------------------------------------------------------------------------
// Speech output
// ---------------------------------------------------------------------------

export interface VoiceLike {
  lang: string;
  localService: boolean;
  default?: boolean;
  name?: string;
}

/**
 * The voice for `lang` ("en-IN" / "hi-IN"): a voice on the device first (exact language and region,
 * then the same language), then an online one; null when none speaks the language (the browser then
 * picks by `utterance.lang`).
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], lang: string): V | null {
  const tag = lang.toLowerCase();
  const base = tag.split("-")[0];
  const norm = (voice: V) => voice.lang.toLowerCase().replace(/_/g, "-");
  const exact = (voice: V) => norm(voice) === tag;
  const sameLanguage = (voice: V) => norm(voice).split("-")[0] === base;
  return (
    voices.find((v) => v.localService && exact(v)) ??
    voices.find((v) => v.localService && sameLanguage(v)) ??
    voices.find(exact) ??
    voices.find(sameLanguage) ??
    null
  );
}

const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁻": "-",
  "⁺": "+",
  "ⁿ": "n",
  "ˣ": "x",
};
const SUBSCRIPT: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  "₊": "+",
  "₋": "-",
  "ₙ": "n",
  "ₓ": "x",
};

/** Greek letters are read by name in both languages (as teachers say them). */
const GREEK: Record<string, string> = {
  α: "alpha",
  β: "beta",
  γ: "gamma",
  δ: "delta",
  Δ: "delta",
  ε: "epsilon",
  θ: "theta",
  λ: "lambda",
  μ: "mu",
  π: "pi",
  ρ: "rho",
  σ: "sigma",
  Σ: "sigma",
  τ: "tau",
  φ: "phi",
  ϕ: "phi",
  ω: "omega",
  Ω: "omega",
  η: "eta",
  ν: "nu",
  χ: "chi",
  ψ: "psi",
};

const LATEX_SYMBOLS: Record<string, string> = {
  times: "×",
  cdot: "×",
  div: "÷",
  pm: "±",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  infty: "∞",
  to: "→",
  rightarrow: "→",
  Rightarrow: "→",
  rightleftharpoons: "⇌",
  degree: "°",
  circ: "°",
  int: "∫",
  sum: "∑",
  Delta: "Δ",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  Sigma: "Σ",
  tau: "τ",
  phi: "φ",
  varphi: "φ",
  omega: "ω",
  Omega: "Ω",
  eta: "η",
  nu: "ν",
};

/** Accents that only decorate a symbol (\vec{F} is read "F"). */
const LATEX_DECORATIONS = new Set(["vec", "hat", "bar", "overline", "overrightarrow", "underline", "boldsymbol", "dot", "ddot", "tilde"]);

/** Something raised to a power: "(a + b)", "[A]", or a run of letters, digits and Greek letters. */
const OPERAND = String.raw`(\([^()\n]{1,40}\)|\[[^[\]\n]{1,40}\]|[A-Za-z0-9.α-ωΑ-Ωϕ]+)`;

/** "(a + b)" → "a + b", "[A]" → "A" (the brackets are not read out). */
const unwrap = (value: string) => (/^\(.*\)$|^\[.*\]$/.test(value) ? value.slice(1, -1).trim() : value);

/** A LaTeX argument: `{…}` or `(…)` without nesting, or one command / character. */
const LATEX_ARG = String.raw`(?:\{([^{}]*)\}|\(([^()]*)\)|(\\[A-Za-z]+|[^\s{}\\]))`;
/** \int, \sum, \lim and \log with a subscript (and, for \int and \sum, a superscript): read as words. */
const LATEX_LIMITS = new RegExp(String.raw`\\(int|sum|lim|log)\s*_\s*${LATEX_ARG}(?:\s*\^\s*${LATEX_ARG}|(?!\s*\^))`, "g");

function latexLimits(op: string, lower: string, upper: string | undefined, say: RanchoSpeechWords): string {
  const a = lower.trim();
  if (op === "log") return ` ${format(say.logBase, { b: a })} `;
  if (op === "lim") {
    const [x, target] = a.split(/\\to(?![A-Za-z])|\\rightarrow(?![A-Za-z])|→|->/);
    return target === undefined ? ` lim ${a} ` : ` ${format(say.limit, { x: x.trim(), a: target.trim() })} `;
  }
  const symbol = op === "int" ? "∫" : "∑";
  if (upper === undefined) return ` ${symbol} ${a} `;
  return ` ${format(op === "int" ? say.integralFromTo : say.sumFromTo, { a, b: upper.trim() })} `;
}

function latexToUnicode(source: string, say: RanchoSpeechWords): string {
  let text = source
    .replace(/\\\(|\\\)|\\\[|\\\]|\$\$?/g, " ")
    // A command keeps its name when a subscript follows (\alpha_{i} → "alpha i", not "alphai").
    .replace(/\\([A-Za-z]+)(?=_)/g, "\\$1 ");
  // Nested \frac / \sqrt: a few passes from the inside out. Limits are read once their parts are
  // plain ("\int_0^{\pi}" → "integral from 0 to pi of"), so their subscript is kept until then.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = text
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
      .replace(/\\sqrt\s*\[3\]\s*\{([^{}]*)\}/g, "∛($1)")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)")
      .replace(/\\(?:text|mathrm|mathbf|operatorname|mathit)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\([A-Za-z]+)\s*\{([^{}]*)\}/g, (match, name: string, inner: string) => (LATEX_DECORATIONS.has(name) ? ` ${inner} ` : match))
      .replace(LATEX_LIMITS, (_m, op: string, a1?: string, a2?: string, a3?: string, b1?: string, b2?: string, b3?: string) =>
        latexLimits(op, a1 ?? a2 ?? a3 ?? "", b1 ?? b2 ?? b3, say),
      )
      .replace(/\^\s*\{([^{}]*)\}/g, "^($1)")
      .replace(/(?<!\\(?:int|sum|lim|log)\s*)_\s*\{([^{}]*)\}/g, " $1 ");
    if (next === text) break;
    text = next;
  }
  return text
    .replace(/\\(?:(?:left|right|displaystyle|limits|quad|qquad)(?![A-Za-z])|[,;!])/g, " ")
    .replace(/\\([A-Za-z]+)/g, (_match, name: string) => LATEX_SYMBOLS[name] ?? (LATEX_DECORATIONS.has(name) ? " " : ` ${name} `))
    .replace(/[{}]/g, " ");
}

/**
 * Turns a Rancho answer (Markdown + Unicode maths, sometimes LaTeX) into text a speech voice reads
 * naturally, in the answer's language (`say` = that locale's words). Pure.
 */
export function speakableText(source: string, say: RanchoSpeechWords): string {
  const word = (value: string) => ` ${value} `;
  let text = source.replace(/\r\n?/g, "\n");

  // Markdown: code blocks are skipped, markers removed.
  text = text
    .replace(/^\s{0,3}```[\s\S]*?(?:^\s{0,3}```|$(?![\s\S]))/gm, "\n")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:[-*•])\s+/gm, "")
    .replace(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, "$1")
    .replace(/`([^`\n]*)`/g, "$1");

  text = latexToUnicode(text, say);

  // Superscripts (x², x⁻¹, x^2, x^(n+1)) and subscripts (v₀ → v0).
  text = text
    .replace(/[₀-₉₊₋ₙₓ]/g, (char) => SUBSCRIPT[char] ?? char)
    .replace(new RegExp(`${OPERAND}([⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿˣ]+)`, "g"), (_m, base: string, sup: string) => {
      const n = [...sup].map((char) => SUPERSCRIPT[char] ?? char).join("");
      return power(unwrap(base), n, say);
    })
    .replace(new RegExp(`${OPERAND}\\s?\\^\\s?(\\([^()\\n]{1,40}\\)|-?[A-Za-z0-9.]{1,8})`, "g"), (_m, base: string, exp: string) =>
      power(unwrap(base), unwrap(exp), say),
    );

  // Roots and vulgar fractions.
  text = text
    .replace(new RegExp(`∛\\s?${OPERAND}`, "g"), (_m, x: string) => word(format(say.cbrt, { x: unwrap(x) })))
    .replace(new RegExp(`√\\s?${OPERAND}`, "g"), (_m, x: string) => word(format(say.sqrt, { x: unwrap(x) })))
    .replace(/½/g, word(say.half))
    .replace(/⅓/g, word(say.third))
    .replace(/¼/g, word(say.quarter))
    .replace(/¾/g, word(say.threeQuarters));

  // "/": a unit after a number ("20 m/s" → "20 m per s"), otherwise a fraction ("3/4", "F/m" → "over").
  text = text
    .replace(/(\d)\s*\/\s*(?=\d)/g, `$1${word(say.over)}`)
    .replace(/(\d\s?[A-Za-z]{1,3})\/([A-Za-z]{1,3})\b/g, `$1${word(say.per)}$2`)
    .replace(/\//g, word(say.over));

  // Operators and symbols.
  text = text
    .replace(/±/g, word(say.plusMinus))
    .replace(/≈|≃|∼/g, word(say.approx))
    .replace(/≠/g, word(say.notEqual))
    .replace(/≤|⩽/g, word(say.lessEq))
    .replace(/≥|⩾/g, word(say.greaterEq))
    .replace(/⇌|⇄/g, word(say.equilibrium))
    .replace(/→|⟶|=>|->/g, word(say.arrow))
    .replace(/∞/g, word(say.infinity))
    .replace(/∫/g, word(say.integral))
    .replace(/∑/g, word(say.sum))
    .replace(/\s<\s/g, word(say.less))
    .replace(/\s>\s/g, word(say.greater))
    .replace(/=/g, word(say.equals))
    .replace(/×|·|∙|\s\*\s/g, word(say.times))
    .replace(/÷/g, word(say.dividedBy))
    .replace(/\+/g, word(say.plus))
    .replace(/−|\s-\s/g, word(say.minus))
    // A leading minus: "-3", "-b", "-(x + 1)" (not a hyphen inside a word).
    .replace(/(^|[\s(\[])-(?=[\dA-Za-z(√∛α-ω])/gm, `$1${say.minus} `)
    .replace(/°/g, word(say.degrees))
    .replace(/%/g, word(say.percent))
    .replace(/[α-ωΑ-Ωϕ]/g, (char) => (GREEK[char] ? word(GREEK[char]) : char));

  // Brackets only group (they are not read out); stray Markdown / LaTeX characters go too.
  return text
    .replace(/[()[\]|#_~^\\]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/ +([.,;:!?।])/g, "$1")
    .trim();
}

function power(base: string, n: string, say: RanchoSpeechWords): string {
  if (n === "2") return ` ${format(say.squared, { x: base })} `;
  if (n === "3") return ` ${format(say.cubed, { x: base })} `;
  const exponent = n.replace(/^-/, `${say.minus} `).replace(/\+/g, ` ${say.plus} `).replace(/(?<=\S)-(?=\S)/g, ` ${say.minus} `);
  return ` ${format(say.power, { x: base, n: exponent })} `;
}

/**
 * Splits speakable text into short pieces (sentences, then commas, then words) so each utterance
 * stays well under the length at which some browsers cut speech off.
 */
export function speechChunks(text: string, max = 180): string[] {
  const sentences = text
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const pieces: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= max) {
      pieces.push(sentence);
      continue;
    }
    let current = "";
    for (const part of sentence.split(/(?<=[,;:])\s+|\s+/)) {
      if (current && current.length + part.length + 1 > max) {
        pieces.push(current);
        current = part;
      } else current = current ? `${current} ${part}` : part;
    }
    if (current) pieces.push(current);
  }
  // Join short neighbours so the voice doesn't pause after every few words.
  const chunks: string[] = [];
  for (const piece of pieces) {
    const last = chunks[chunks.length - 1];
    if (last !== undefined && last.length + piece.length + 1 <= max) chunks[chunks.length - 1] = `${last} ${piece}`;
    else chunks.push(piece);
  }
  return chunks;
}
