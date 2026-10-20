import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guard: copy from the design mockups (reference/homepage/*.png) that is only a
 * placeholder must never ship in UI code — a fake phone number, centres Aspire
 * does not list, unverified stats and claims, and invented student results.
 *
 * Scans src/components/**, src/app/** and src/i18n/** (UI message catalogs, D-028; test files excluded). It does NOT scan
 * src/content/**, where e.g. "Solan" can be a legitimate district name.
 * Matching ignores case (the mockup sets some copy in uppercase), treats any
 * whitespace run — including a line break or a JSX {" "} spacer — as one space,
 * and respects word boundaries, so "Solan" does not match "isolation".
 */
const MOCKUP_STRINGS = [
  "98765 43210",
  "Palampur",
  "Solan",
  "Trusted Choice",
  "Ex-IIT Faculty",
  "20+ Years",
  "10+ Years",
  "5000+ Students",
  "AIR 48",
  "Rohan Mehta",
  "Sneha Verma",
  "Real Success",
  "We Make It Possible",
  // Extended after the Wave 2 integrity review (L-4).
  "AIR 62",
  "AIR 101",
  "AIR 118",
  "Kartik Thakur",
  "Ananya Sharma",
  "Pareet",
  "Learn from the Best",
  "safe with us",
  "Mentored 1000s",
  "© 2025",
] as const;

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const SCANNED_DIRS = ["components", "app", "i18n"];
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".webm", ".mp3", ".pdf", ".zip",
]);

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

function isScanned(path: string): boolean {
  return !/\.test\.tsx?$/.test(path) && !BINARY_EXTENSIONS.has(extname(path).toLowerCase());
}

/** Collapses JSX explicit spaces ({" "}) and non-breaking spaces so split copy still matches. */
function normalise(text: string): string {
  return text.replace(/\{\s*(["'`])\s*\1\s*\}/g, " ").replace(/&nbsp;| /g, " ");
}

function toPattern(needle: string): RegExp {
  const body = needle
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const start = /^\w/.test(needle) ? "\\b" : "";
  const end = /\w$/.test(needle) ? "\\b" : "";
  return new RegExp(`${start}${body}${end}`, "i");
}

const files = SCANNED_DIRS.flatMap((dir) => listFiles(join(SRC_DIR, dir))).filter(isScanned);
const contents = new Map(files.map((file) => [file, normalise(readFileSync(file, "utf8"))]));
const display = (file: string) => relative(SRC_DIR, file).split(sep).join("/");

describe("mockup placeholder strings in UI code", () => {
  it("scans the UI source tree", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((file) => display(file).startsWith("components/"))).toBe(true);
    expect(files.some((file) => display(file).startsWith("app/"))).toBe(true);
    expect(files.some((file) => display(file).startsWith("i18n/messages/"))).toBe(true);
    expect(files.some((file) => /\.test\.tsx?$/.test(file))).toBe(false);
  });

  it.each(MOCKUP_STRINGS)("%j does not appear in src/components, src/app or src/i18n", (needle) => {
    const pattern = toPattern(needle);
    const hits = files.filter((file) => pattern.test(contents.get(file) ?? "")).map(display);
    expect(hits, `Mockup placeholder ${JSON.stringify(needle)} found in: ${hits.join(", ")}`).toEqual([]);
  });

  it("matcher: ignores case and whitespace runs, respects word boundaries", () => {
    expect(toPattern("We Make It Possible").test(normalise('We Make It{" "}\n          POSSIBLE.'))).toBe(true);
    expect(toPattern("Trusted Choice").test("Himachal Pradesh's TRUSTED CHOICE")).toBe(true);
    expect(toPattern("98765 43210").test('href="tel:+91 98765 43210"')).toBe(true);
    expect(toPattern("5000+ Students").test("5000+ students guided")).toBe(true);
    expect(toPattern("AIR 48").test("AIR 480")).toBe(false);
    expect(toPattern("Solan").test("isolation")).toBe(false);
    expect(toPattern("Solan").test("Shimla, Solan")).toBe(true);
  });
});
