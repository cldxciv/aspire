"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  canSpeak,
  joinTranscript,
  pickVoice,
  recognitionProblem,
  speakableText,
  speechChunks,
  speechRecognitionCtor,
  type RanchoSpeechWords,
  type RecognitionLike,
  type VoiceProblem,
} from "./rancho-voice";

const noSubscribe = () => () => {};

/**
 * What this browser can do: `listen` = speech-to-text (🎤), `speak` = read answers aloud (🔊).
 * Both are false on the server and in the first client render (no hydration mismatch).
 */
export function useVoiceSupport(): { listen: boolean; speak: boolean } {
  const listen = useSyncExternalStore(noSubscribe, () => speechRecognitionCtor() !== null, () => false);
  const speak = useSyncExternalStore(noSubscribe, () => canSpeak(), () => false);
  return { listen, speak };
}

export interface SpeechInputHandlers {
  /** Everything heard so far (interim included), each time it changes. */
  onText: (heard: string) => void;
  /** Recognition ended; `heard` is the final text ("" when nothing was understood). */
  onEnd: (heard: string) => void;
}

/**
 * 🎤 One spoken question at a time: `start(lang, handlers)` listens until the student pauses (or
 * presses the mic again: `stop()`), showing interim words as they come. Nothing is sent: the student
 * reviews the text and presses Send. Errors (permission denied, no microphone, offline) become
 * `problem`. `abort()` ends it without a result (New chat, closing the panel, unmount).
 */
export function useSpeechInput() {
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<VoiceProblem | null>(null);

  const abort = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // already stopped
      }
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
  }, []);

  const start = useCallback(
    (lang: string, handlers: SpeechInputHandlers) => {
      const Recognition = speechRecognitionCtor();
      if (!Recognition) return false;
      abort();
      let recognition: RecognitionLike;
      try {
        recognition = new Recognition();
      } catch {
        setProblem("other");
        return false;
      }
      let heard = "";
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        heard = joinTranscript(event.results);
        handlers.onText(heard);
      };
      recognition.onerror = (event) => {
        const next = recognitionProblem(event.error);
        if (next) setProblem(next);
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        setListening(false);
        handlers.onEnd(heard);
      };
      try {
        recognition.start();
      } catch {
        setProblem("other");
        return false;
      }
      recognitionRef.current = recognition;
      setProblem(null);
      setListening(true);
      return true;
    },
    [abort],
  );

  useEffect(() => abort, [abort]);

  return { listening, problem, setProblem, start, stop, abort };
}

/**
 * 🔊 Reads one answer at a time aloud (`speak(id, text)`; speaking another answer, `stop()`, New chat
 * or unmount cancels it). The text goes through `speakableText()` and is split into short
 * utterances. `speakingId` is the answer being read, for its Listen / Stop button.
 */
export function useSpeechOutput(say: RanchoSpeechWords) {
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const sessionRef = useRef(0);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    setSpeakingId(null);
    if (canSpeak()) window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback(
    (id: number, text: string, lang: string) => {
      if (!canSpeak()) return;
      const synth = window.speechSynthesis;
      const session = ++sessionRef.current;
      synth.cancel();
      const chunks = speechChunks(speakableText(text, say));
      if (chunks.length === 0) {
        setSpeakingId(null);
        return;
      }
      const voice = pickVoice(synth.getVoices(), lang);
      setSpeakingId(id);
      chunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = voice?.lang ?? lang;
        if (voice) utterance.voice = voice;
        const finish = () => {
          if (sessionRef.current === session) setSpeakingId(null);
        };
        if (index === chunks.length - 1) utterance.onend = finish;
        utterance.onerror = (event) => {
          // "interrupted" / "canceled" come from our own cancel(); anything else ends this answer.
          if (event.error !== "interrupted" && event.error !== "canceled") {
            if (sessionRef.current === session) synth.cancel();
            finish();
          }
        };
        synth.speak(utterance);
      });
    },
    [say],
  );

  // Ask for the voice list early (Chrome loads it asynchronously), and stop speaking on unmount.
  useEffect(() => {
    if (!canSpeak()) return;
    const synth = window.speechSynthesis;
    synth.getVoices();
    const load = () => synth.getVoices();
    synth.addEventListener?.("voiceschanged", load);
    const session = sessionRef;
    return () => {
      synth.removeEventListener?.("voiceschanged", load);
      session.current += 1;
      synth.cancel();
    };
  }, []);

  return { speakingId, speak, stop };
}
