import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hiOverlays } from "@/content/hi";
import { duplicateCards, rankerCardSizes, resultCardRankers } from "@/content/result-photos";
import { RESULT_CARD_PATH, rankers, results, resultCardAlt } from "@/content/results";
import { withPermittedName } from "@/components/results/server-view";
import { canServeResultCard, getRankers, getResultCards, getResults, localizeImage } from "@/lib/data";
import { toPublicResult } from "@/lib/server/public-content";
import type { ResultRecord } from "@/lib/types";

import { GET as getResultsApi } from "@/app/api/results/route";
import { GET as getResultCardFile } from "@/app/api/result-cards/[file]/route";

// `connection()` needs a Next.js request scope; outside Next it throws. It only marks the route as dynamic.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

const preview = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
const production = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");

const CARD_DIR = path.join(process.cwd(), "private", "result-cards");
const DEVANAGARI = /[ऀ-ॿ]/;
const cardFile = (file: string) =>
  getResultCardFile(new Request(`http://localhost:3000/api/result-cards/${file}`), { params: Promise.resolve({ file }) });
const resultsApi = async (query = "") => (await getResultsApi(new NextRequest(`http://localhost:3000/api/results${query}`))).text();

describe("result-card import (D-031)", () => {
  it("gives every imported ranker a card file outside public/, ≤ 400 px wide, with factual alt text", () => {
    expect(Object.keys(rankerCardSizes)).toHaveLength(rankers.length);
    for (const r of rankers) {
      expect(r.photo, r.id).toBeDefined();
      const photo = r.photo!;
      expect(photo.src).toBe(`${RESULT_CARD_PATH}${r.id}.webp`);
      expect(photo.width).toBeLessThanOrEqual(400);
      expect(existsSync(path.join(CARD_DIR, `${r.id}.webp`)), r.id).toBe(true);
      expect(photo.alt).toBe(resultCardAlt({ name: r.studentDisplayName, institution: r.institution, exam: r.exam, year: r.year }));
      expect(photo.alt).not.toMatch(/verified|topper|guarantee/i);
    }
    expect(rankers.find((r) => r.id === "ranker-24")?.photo?.alt).toBe("Arnav Thakur — NIT Kurukshetra, JEE 2026 result card");
    expect(rankers.find((r) => r.id === "ranker-68")?.photo?.alt).toBe("Shaurya Sharma — JEE 2025 result card");
    // Personal data never sits in the unconditionally served public/ folder.
    expect(existsSync(path.join(process.cwd(), "public", "images", "results"))).toBe(false);
  });

  it("records only true duplicates: same student, college, exam and year", () => {
    const byId = new Map(rankers.map((r) => [r.id, r]));
    expect(Object.keys(duplicateCards).length).toBeGreaterThan(0);
    for (const [id, first] of Object.entries(duplicateCards)) {
      const [a, b] = [byId.get(id), byId.get(first)];
      expect(a && b, id).toBeTruthy();
      expect([a?.studentDisplayName, a?.institution, a?.exam, a?.year]).toEqual([b?.studentDisplayName, b?.institution, b?.exam, b?.year]);
    }
  });

  it("links selections-wall records only to existing ranker cards, and every photo has a Hindi alt", () => {
    for (const [resultId, rankerId] of Object.entries(resultCardRankers)) {
      expect(results.some((r) => r.id === resultId), resultId).toBe(true);
      expect(rankerCardSizes[rankerId], rankerId).toBeDefined();
    }
    for (const record of [...rankers, ...results]) {
      if (record.photo) expect(hiOverlays.resultPhotoAlt[record.photo.src], record.id).toMatch(DEVANAGARI);
    }
  });
});

describe("production: no result-card photo anywhere (placeholders, consent pending)", () => {
  it("returns no cards and serves no file", async () => {
    production();
    expect(await getResultCards()).toEqual([]);
    expect(await getResultCards({ exam: "NEET", limit: 9 }, "hi")).toEqual([]);
    expect(await getRankers()).toEqual([]);
    for (const file of ["ranker-24.webp", "ranker-738.webp"]) {
      expect(canServeResultCard(file)).toBe(false);
      const response = await cardFile(file);
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");
    }
  });

  it("keeps photos out of the public JSON API", async () => {
    production();
    const body = await resultsApi();
    expect(body).not.toContain("photo");
    expect(body).not.toContain(RESULT_CARD_PATH);
  });
});

describe("preview / development: cards follow the name rule", () => {
  it("lists every distinct card, most recent year first in source order, all DEMO", async () => {
    preview();
    const cards = await getResultCards();
    expect(cards).toHaveLength(rankers.length - Object.keys(duplicateCards).length);
    expect(new Set(cards.map((c) => c.photo.src)).size).toBe(cards.length);
    expect(cards.every((c) => c.placeholder && c.name && c.label === `${c.exam} ${c.year}`)).toBe(true);
    const years = cards.map((c) => c.year);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    const order = new Map(rankers.map((r, i) => [r.id, i]));
    for (let i = 1; i < cards.length; i += 1) {
      if (cards[i].year === cards[i - 1].year) expect(order.get(cards[i].id)!).toBeGreaterThan(order.get(cards[i - 1].id)!);
    }
    expect(cards[0]).toMatchObject({ id: "ranker-24", name: "Arnav Thakur", institute: "NIT Kurukshetra", exam: "JEE", year: 2026 });
    expect(cards.some((c) => c.id in duplicateCards)).toBe(false);
  });

  it("filters by exam and year and honours limit", async () => {
    preview();
    const neet = await getResultCards({ exam: "NEET", limit: 9 });
    expect(neet).toHaveLength(9);
    expect(neet.every((c) => c.exam === "NEET")).toBe(true);
    expect((await getResultCards({ year: 2017 })).every((c) => c.year === 2017)).toBe(true);
    expect((await getResultCards({ limit: 0 })).length).toBe((await getResultCards()).length);
  });

  it("serves visible cards as webp, privately cached, and nothing else", async () => {
    preview();
    expect(canServeResultCard("ranker-24.webp")).toBe(true);
    const response = await cardFile("ranker-24.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    for (const file of ["ranker-99999.webp", "ranker-24.png", "..%2F..%2Fpackage.json", "../../package.json", "ranker-24.webp.map"]) {
      expect((await cardFile(file)).status, file).toBe(404);
    }
  });

  it("still keeps photos out of /api/results (consent pending) and out of the archive's client data", async () => {
    preview();
    const body = await resultsApi();
    expect(body).not.toContain("photo");
    expect(body).not.toContain(RESULT_CARD_PATH);
    const photo = rankers[0].photo!;
    const [result] = await getResults();
    const withPhoto: ResultRecord = { ...result, photo };
    expect(toPublicResult(withPhoto)).not.toHaveProperty("photo");
    expect(withPermittedName(withPhoto)).not.toHaveProperty("photo");
    // Only explicit granted consent exposes it.
    expect(toPublicResult({ ...withPhoto, status: "published", consentStatus: "granted" }).photo).toEqual(photo);
  });
});

describe("Hindi alt text", () => {
  it("translates only the words around the name, college, exam and year", async () => {
    preview();
    const expected = "Arnav Thakur — NIT Kurukshetra, JEE 2026 का परिणाम कार्ड";
    expect((await getResultCards({ limit: 1 }, "hi"))[0].photo.alt).toBe(expected);
    expect((await getResultCards({ limit: 1, locale: "hi" }))[0].photo.alt).toBe(expected);
    expect((await getResultCards({ limit: 1 }))[0].photo.alt).toBe("Arnav Thakur — NIT Kurukshetra, JEE 2026 result card");
    const photo = rankers[0].photo!;
    expect(localizeImage(photo, "hi")).toEqual({ ...photo, alt: expected });
    const noCollege = rankers.find((r) => r.id === "ranker-68")!.photo!;
    expect(localizeImage(noCollege, "hi").alt).toBe("Shaurya Sharma — JEE 2025 का परिणाम कार्ड");
    const hiRanker = (await getRankers({ year: 2026 }, "hi")).find((r) => r.id === "ranker-24");
    expect(hiRanker?.photo).toEqual({ ...photo, alt: expected });
  });

  it("covers every card and never changes the English source", async () => {
    preview();
    const snapshot = structuredClone(rankers.slice(0, 5));
    for (const card of await getResultCards(undefined, "hi")) expect(card.photo.alt, card.id).toMatch(/का परिणाम कार्ड$/);
    expect(rankers.slice(0, 5)).toEqual(snapshot);
    expect(readFileSync(path.join(CARD_DIR, "ranker-24.webp")).length).toBeGreaterThan(1000);
  });
});
