import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { messagesFor } from "@/i18n/messages";

import {
  canSpeak,
  joinTranscript,
  pickVoice,
  recognitionProblem,
  speakableText,
  speechChunks,
  speechLang,
  speechRecognitionCtor,
  withTranscript,
  type RecognitionResultListLike,
} from "./rancho-voice";

/** Voice in the Rancho chat: feature detection, recognition results, voices and speakable text. */

const en = messagesFor("en", "rancho").panel.voice.say;
const hi = messagesFor("hi", "rancho").panel.voice.say;

class FakeRecognition {}

describe("feature detection", () => {
  it("finds SpeechRecognition or the webkit-prefixed one, and nothing elsewhere (e.g. Firefox, server)", () => {
    expect(speechRecognitionCtor({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(speechRecognitionCtor({ webkitSpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(speechRecognitionCtor({})).toBeNull();
    expect(speechRecognitionCtor({ SpeechRecognition: "nope" })).toBeNull();
    expect(speechRecognitionCtor(undefined)).toBeNull();
    // Tests run in Node: no window, so nothing is detected and the 🎤 / 🔊 buttons stay hidden.
    expect(speechRecognitionCtor()).toBeNull();
    expect(canSpeak()).toBe(false);
  });

  it("can speak only with both speechSynthesis and SpeechSynthesisUtterance", () => {
    expect(canSpeak({ speechSynthesis: {}, SpeechSynthesisUtterance: FakeRecognition })).toBe(true);
    expect(canSpeak({ speechSynthesis: {} })).toBe(false);
    expect(canSpeak({ SpeechSynthesisUtterance: FakeRecognition })).toBe(false);
    expect(canSpeak({ speechSynthesis: null, SpeechSynthesisUtterance: FakeRecognition })).toBe(false);
  });

  it("listens and speaks in Indian English or Hindi, from the answer language", () => {
    expect(speechLang("en")).toBe("en-IN");
    expect(speechLang("hi")).toBe("hi-IN");
  });

  it("the hooks report no support on the server and the first client render (no hydration mismatch)", () => {
    const source = readFileSync(join(process.cwd(), "src", "components", "rancho", "useRanchoVoice.ts"), "utf8");
    expect(source).toContain("useSyncExternalStore(noSubscribe, () => speechRecognitionCtor() !== null, () => false)");
    expect(source).toContain("useSyncExternalStore(noSubscribe, () => canSpeak(), () => false)");
    // One spoken question at a time, interim words shown, nothing sent automatically.
    expect(source).toContain("recognition.interimResults = true");
    expect(source).toContain("recognition.continuous = false");
    expect(source).not.toMatch(/fetch\(|ASK_ENDPOINT/);
  });
});

describe("speech recognition results", () => {
  const results = (...parts: Array<[string, boolean]>): RecognitionResultListLike =>
    Object.assign(
      parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })),
      { length: parts.length },
    );

  it("joins final and interim words, and appends them to what was typed", () => {
    expect(joinTranscript(results(["find the  maximum", true], [" height", false]))).toBe("find the maximum height");
    expect(joinTranscript(results())).toBe("");
    expect(withTranscript("", "find the height")).toBe("find the height");
    expect(withTranscript("Projectile:  ", "find the height")).toBe("Projectile: find the height");
    expect(withTranscript("Typed", "  ")).toBe("Typed");
  });

  it("maps recognition errors (a deliberate stop is not an error)", () => {
    expect(recognitionProblem("aborted")).toBeNull();
    expect(recognitionProblem("not-allowed")).toBe("denied");
    expect(recognitionProblem("service-not-allowed")).toBe("denied");
    expect(recognitionProblem("no-speech")).toBe("no_speech");
    expect(recognitionProblem("audio-capture")).toBe("no_mic");
    expect(recognitionProblem("network")).toBe("network");
    expect(recognitionProblem("language-not-supported")).toBe("other");
  });

  it("has a message for every problem, in both languages, and says how to recover from a denied microphone", () => {
    for (const locale of ["en", "hi"] as const) {
      const voice = messagesFor(locale, "rancho").panel.voice;
      for (const text of [voice.errors.denied, voice.errors.noMic, voice.errors.network, voice.errors.other, voice.nothingHeard]) {
        expect(text.trim()).not.toBe("");
      }
    }
    expect(messagesFor("en", "rancho").panel.voice.errors.denied).toMatch(/settings.*type your question/);
  });
});

describe("choosing a voice", () => {
  const voice = (lang: string, localService: boolean, name = lang) => ({ lang, localService, name });

  it("prefers a voice on the device in the exact language, then the same language, then an online one", () => {
    const googleHindi = voice("hi-IN", false, "Google हिन्दी");
    const kalpana = voice("hi-IN", true, "Microsoft Kalpana");
    const heera = voice("en-IN", true, "Microsoft Heera");
    const zira = voice("en-US", true, "Microsoft Zira");
    expect(pickVoice([googleHindi, zira, kalpana, heera], "hi-IN")).toBe(kalpana);
    expect(pickVoice([googleHindi, zira], "hi-IN")).toBe(googleHindi);
    expect(pickVoice([zira, heera], "en-IN")).toBe(heera);
    expect(pickVoice([zira, voice("en-GB", false)], "en-IN")).toBe(zira);
    expect(pickVoice([voice("en_IN", true, "Android")], "en-IN")?.name).toBe("Android");
    expect(pickVoice([zira], "hi-IN")).toBeNull(); // the browser then picks by utterance.lang
    expect(pickVoice([], "en-IN")).toBeNull();
  });
});

describe("speakable text", () => {
  it("drops Markdown and reads Unicode maths as words", () => {
    expect(speakableText("**Final answer:** v² = u² + 2as", en)).toBe("Final answer: v squared equals u squared plus 2as");
    expect(speakableText("## Step 1\n- Use `F = ma`\n- a = F/m", en)).toBe("Step 1\nUse F equals ma\na equals F over m");
    expect(speakableText("√(a + b) ≈ 3.2 and x³ ≠ 0", en)).toBe("square root of a plus b approximately 3.2 and x cubed is not equal to 0");
    expect(speakableText("θ = 30°, so sin θ = ½", en)).toBe("theta equals 30 degrees, so sin theta equals one half");
    expect(speakableText("10⁻³ × 2 ÷ 4 − 1", en)).toBe("10 to the power minus 3 times 2 divided by 4 minus 1");
    expect(speakableText("E = mc^2 and x^(n+1)", en)).toBe("E equals mc squared and x to the power n plus 1");
    expect(speakableText("v = 20 m/s, a ≥ 0 → done", en)).toBe("v equals 20 m per s, a is greater than or equal to 0 gives done");
    expect(speakableText("N₂ + 3H₂ ⇌ 2NH₃", en)).toBe("N2 plus 3H2 is in equilibrium with 2NH3");
    expect(speakableText("```\ncode\n```\nThen 3/4 of it", en)).toBe("Then 3 over 4 of it");
  });

  it("reads the occasional LaTeX too", () => {
    expect(speakableText("$\\frac{1}{2}mv^{2}$", en)).toBe("1 over 2 mv squared");
    expect(speakableText("\\(\\sqrt{x} \\times \\pi\\)", en)).toBe("square root of x times pi");
    expect(speakableText("\\Delta H \\leq 0", en)).toBe("delta H is less than or equal to 0");
  });

  it("reads LaTeX limits, logs, accents and subscripts on commands as words", () => {
    expect(speakableText("$\\sum_{i=1}^{n} i$", en)).toBe("sum from i equals 1 to n of i");
    expect(speakableText("\\(\\int_0^{\\pi} \\sin x \\, dx\\)", en)).toBe("integral from 0 to pi of sin x dx");
    expect(speakableText("$\\int_{0}^{\\frac{\\pi}{2}} \\cos\\theta$", en)).toBe("integral from 0 to pi over 2 of cos theta");
    expect(speakableText("$\\lim_{x \\to 0} \\frac{\\sin x}{x}$", en)).toBe("limit as x tends to 0 of sin x over x");
    expect(speakableText("$\\log_{10} 100 = 2$", en)).toBe("log to the base 10 of 100 equals 2");
    expect(speakableText("$\\vec{F} = m\\vec{a}$", en)).toBe("F equals m a");
    expect(speakableText("$\\alpha_{1} + \\sin^2\\theta$", en)).toBe("alpha 1 plus sin squared theta");
    expect(speakableText("$x \\rightarrow \\infty$", en)).toBe("x gives infinity");
    expect(speakableText("$\\int x\\,dx$", en)).toBe("integral of x dx");
    // Hindi word order for limits.
    expect(speakableText("$\\int_0^1 x$", hi)).toBe("0 से 1 तक समाकलन x");
  });

  it("reads a leading minus before letters and brackets, and powers of bracketed terms", () => {
    expect(speakableText("x = -b ± √(b² − 4ac)", en)).toBe("x equals minus b plus or minus square root of b squared minus 4ac");
    expect(speakableText("rate = k[A]^2[B]", en)).toBe("rate equals k A squared B");
    expect(speakableText("(-3, 4) and well-known", en)).toBe("minus 3, 4 and well-known");
    expect(speakableText("Δx² + θ^2", en)).toBe("delta x squared plus theta squared");
  });

  it("uses the Hindi words (with Hindi word order) for Hindi answers", () => {
    expect(speakableText("**अंतिम उत्तर:** v² = u² + 2as", hi)).toBe("अंतिम उत्तर: v का वर्ग बराबर u का वर्ग प्लस 2as");
    expect(speakableText("√x = 4", hi)).toBe("x का वर्गमूल बराबर 4");
    expect(hi.power).toContain("{x}");
    expect(hi.power).toContain("{n}");
  });

  it("splits long answers into short utterances at sentence and word boundaries", () => {
    const long = `${"The ball rises and slows down because gravity acts against its motion. ".repeat(6)}${"word ".repeat(80)}`;
    const chunks = speechChunks(speakableText(long, en), 180);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(180);
      expect(chunk).toBe(chunk.trim());
    }
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(speakableText(long, en).replace(/\s+/g, " "));
    expect(speechChunks("")).toEqual([]);
    expect(speechChunks("पहला वाक्य। दूसरा वाक्य।", 12)).toEqual(["पहला वाक्य।", "दूसरा वाक्य।"]);
  });
});
