import { describe, expect, it } from "vitest";
import { EXAM_IDS } from "@/lib/planner/types";
import { FLASHCARDS, FLASHCARDS_STATUS, flashcardsForExam } from "./flashcards";
import { getAllSyllabusTopics, getSyllabusTopics, MOCK_MINUTES, SYLLABUS_STATUS } from "./syllabus";

// Ids are stored in students' saved progress (src/lib/planner/state.ts): same pattern, never empty.
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const DEVANAGARI = /[ऀ-ॿ]/;

describe("planner syllabus map", () => {
  it("is sample content until Aspire approves it (D-032)", () => {
    expect(SYLLABUS_STATUS).toBe("placeholder");
    expect(FLASHCARDS_STATUS).toBe("placeholder");
  });

  it("has unique, storable topic ids with English and Hindi names for every exam", () => {
    for (const exam of EXAM_IDS) {
      const topics = getSyllabusTopics(exam);
      expect(topics.length).toBeGreaterThan(20);
      expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length);
      for (const topic of topics) {
        expect(topic.id).toMatch(ID);
        expect(topic.name.en.trim()).not.toBe("");
        expect(topic.name.hi).toMatch(DEVANAGARI);
      }
      expect(MOCK_MINUTES[exam]).toBeGreaterThan(0);
    }
  });

  it("never reuses one id for two different topics", () => {
    const byId = new Map<string, string>();
    for (const exam of EXAM_IDS) {
      for (const topic of getSyllabusTopics(exam)) {
        const seen = byId.get(topic.id);
        if (seen) expect(seen).toBe(JSON.stringify(topic));
        byId.set(topic.id, JSON.stringify(topic));
      }
    }
    expect(getAllSyllabusTopics().length).toBe(byId.size);
  });
});

describe("planner flashcards", () => {
  const topicIds = new Set(getAllSyllabusTopics().map((t) => t.id));

  it("have unique ids, both languages and real topic links", () => {
    expect(new Set(FLASHCARDS.map((c) => c.id)).size).toBe(FLASHCARDS.length);
    for (const card of FLASHCARDS) {
      expect(card.id).toMatch(ID);
      expect(card.levels.length).toBeGreaterThan(0);
      expect(card.topics.length).toBeGreaterThan(0);
      for (const id of card.topics) expect(topicIds.has(id), `${card.id} → ${id}`).toBe(true);
      expect(card.front.en.trim()).not.toBe("");
      expect(card.back.en.trim()).not.toBe("");
      expect(card.front.hi).toMatch(DEVANAGARI);
      expect(card.back.hi.trim()).not.toBe("");
    }
  });

  it("fit within the saved-state limit for every exam", () => {
    for (const exam of EXAM_IDS) {
      const subjects = [...new Set(getSyllabusTopics(exam).map((t) => t.subject))];
      const cards = flashcardsForExam(exam, subjects);
      expect(cards.length).toBeGreaterThan(5);
      expect(cards.length).toBeLessThanOrEqual(400);
      expect(cards.every((card) => subjects.includes(card.subject))).toBe(true);
    }
  });
});
