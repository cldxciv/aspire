#!/usr/bin/env node
/**
 * Imports Aspire's result-card images from the owner's demo site (D-031,
 * docs/demo-data-import.md → "Result cards").
 *
 *   node scripts/import-result-cards.mjs            download missing cards, regenerate the mapping
 *   node scripts/import-result-cards.mjs --force    re-download and re-encode every card
 *   node scripts/import-result-cards.mjs --report <file.json>   also write a JSON match report
 *
 * Source: GET https://aspire2.thechunkmedia.com/rankers.json?exam=all&offset=<n>&limit=48
 * → { total, offset, items: [{ id, img, w, h, alt, label: "JEE 2026", name, institute, detail }] }.
 *
 * Each demo item is matched to the ranker record `ranker-<id>` in src/content/results.ts and kept only
 * when name, college and exam/year agree. Selections-wall records (`results`) are matched to a ranker
 * card by name + exam + year + college. Cards are re-encoded with sharp (webp, ≤ 400 px wide, q78).
 *
 * PERSONAL DATA: the cards show real students (photo + name) whose publication consent is pending.
 * They are written to `private/result-cards/` — NOT `public/`, which is served unconditionally and,
 * for `/images/`, outside the preview password gate (D-027). The app serves them only through
 * GET /api/result-cards/[file], under the same rule as student names (canShowStudentName()).
 *
 * Polite: pages are fetched sequentially, images with at most 4 concurrent downloads, with retries.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://aspire2.thechunkmedia.com/rankers.json";
const PAGE_SIZE = 48;
const CONCURRENCY = 4;
const MAX_WIDTH = 400;
const QUALITY = 78;
const OUT_DIR = join(ROOT, "private", "result-cards");
const RESULTS_TS = join(ROOT, "src", "content", "results.ts");
const MAPPING_TS = join(ROOT, "src", "content", "result-photos.ts");

const args = process.argv.slice(2);
const force = args.includes("--force");
const reportIndex = args.indexOf("--report");
const reportPath = reportIndex !== -1 ? args[reportIndex + 1] : null;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** fetch with retries (exponential backoff) — returns the Response of the first 2xx attempt. */
async function fetchWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "aspire-web result-card import" } });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(1000 * 2 ** (attempt - 1));
  }
  throw lastError;
}

/** All demo items, page by page (sequential). */
async function fetchDemoItems() {
  const items = [];
  let total = Infinity;
  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const page = await (await fetchWithRetry(`${SOURCE}?exam=all&offset=${offset}&limit=${PAGE_SIZE}`)).json();
    total = page.total;
    if (!Array.isArray(page.items) || page.items.length === 0) break;
    items.push(...page.items);
  }
  if (items.length !== total) console.warn(`Warning: fetched ${items.length} items, the source reports ${total}.`);
  return items;
}

const unquote = (s) => JSON.parse(`"${s}"`);
const norm = (s) => (s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** Ranker rows and selections-wall records, parsed from src/content/results.ts (the source of truth). */
function readContent() {
  const source = readFileSync(RESULTS_TS, "utf8");
  const str = `"((?:[^"\\\\]|\\\\.)*)"`;
  const rowPattern = new RegExp(`^\\s*\\[(\\d+), ${str}, ${str}, "(JEE|NEET|Foundation|Integrated)", (\\d{4})(?:, ${str})?\\],?\\s*$`, "gm");
  const rankers = [...source.matchAll(rowPattern)].map((m) => ({
    id: `ranker-${m[1]}`,
    demoId: Number(m[1]),
    name: unquote(m[2]),
    institution: unquote(m[3]),
    exam: m[4],
    year: Number(m[5]),
  }));
  const results = [...source.matchAll(/selection\(\{([\s\S]*?)\n {2}\}\),/g)].map((m) => {
    const field = (key) => {
      const hit = new RegExp(`\\b${key}: (?:${str}|(\\d+))`).exec(m[1]);
      return hit ? (hit[1] !== undefined ? unquote(hit[1]) : Number(hit[2])) : undefined;
    };
    return {
      id: field("id"),
      name: field("studentDisplayName"),
      exam: field("exam"),
      year: field("year"),
      destination: field("destination"),
      rankOrOutcome: field("rankOrOutcome"),
    };
  });
  return { rankers, results };
}

/** Significant words of a college name ("MBBS · Tanda" → ["tanda"], "IGMC Shimla" → ["igmc", "shimla"]). */
function collegeWords(institution) {
  return norm(institution)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !["mbbs", "b", "tech", "btech", "bds", "the", "of", "and"].includes(w));
}

/** True when the selections-wall destination names the same college as the ranker card. */
function sameCollege(institution, result) {
  const words = collegeWords(institution);
  if (words.length === 0) return false;
  const text = norm(`${result.destination ?? ""} ${result.rankOrOutcome ?? ""}`);
  return words.some((w) => new RegExp(`\\b${w}\\b`).test(text));
}

/** Runs `task` over `items` with at most `limit` in flight. */
async function pool(items, limit, task) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const { rankers, results } = readContent();
  if (rankers.length === 0) throw new Error(`No ranker rows parsed from ${RESULTS_TS}`);
  console.log(`Content: ${rankers.length} ranker records, ${results.length} selections-wall records.`);

  const items = await fetchDemoItems();
  console.log(`Demo: ${items.length} items.`);

  // 1. Match demo items to ranker records (id first, then name + college + exam/year must agree).
  const rankerById = new Map(rankers.map((r) => [r.id, r]));
  const matched = [];
  const mismatched = [];
  const demoOnly = [];
  for (const item of items) {
    const record = rankerById.get(`ranker-${item.id}`);
    if (!record) {
      demoOnly.push({ demoId: item.id, name: item.name, label: item.label });
      continue;
    }
    const problems = [];
    if (norm(item.name) !== norm(record.name)) problems.push(`name "${item.name}" ≠ "${record.name}"`);
    if (norm(item.institute) !== norm(record.institution)) problems.push(`college "${item.institute}" ≠ "${record.institution}"`);
    if (norm(item.label) !== norm(`${record.exam} ${record.year}`)) problems.push(`label "${item.label}" ≠ "${record.exam} ${record.year}"`);
    if (typeof item.img !== "string" || !/^https:\/\/aspire2\.thechunkmedia\.com\/media\/rankers\/[\w.-]+\.webp$/.test(item.img)) {
      problems.push(`unexpected image URL ${item.img}`);
    }
    if (problems.length > 0) mismatched.push({ id: record.id, problems });
    else matched.push({ record, item });
  }
  const matchedIds = new Set(matched.map((m) => m.record.id));
  const recordsWithoutCard = rankers.filter((r) => !matchedIds.has(r.id) && !mismatched.some((m) => m.id === r.id));

  // 2. Download + re-encode (≤ 4 concurrent), idempotent unless --force.
  mkdirSync(OUT_DIR, { recursive: true });
  const sizes = new Map();
  const hashes = new Map();
  const failed = [];
  let downloaded = 0;
  await pool(matched, CONCURRENCY, async ({ record, item }) => {
    const file = join(OUT_DIR, `${record.id}.webp`);
    try {
      if (!force && existsSync(file)) {
        const meta = await sharp(file).metadata();
        sizes.set(record.id, [meta.width, meta.height]);
        hashes.set(record.id, createHash("sha256").update(readFileSync(file)).digest("hex"));
        return;
      }
      const input = Buffer.from(await (await fetchWithRetry(item.img)).arrayBuffer());
      const { data, info } = await sharp(input)
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      writeFileSync(file, data);
      sizes.set(record.id, [info.width, info.height]);
      hashes.set(record.id, createHash("sha256").update(data).digest("hex"));
      downloaded += 1;
      if (downloaded % 50 === 0) console.log(`  … ${downloaded} downloaded`);
    } catch (error) {
      failed.push({ id: record.id, url: item.img, error: String(error?.message ?? error) });
    }
  });

  // Identical card files under different records (e.g. the source's exact duplicate rows).
  const byHash = new Map();
  for (const [id, hash] of hashes) byHash.set(hash, [...(byHash.get(hash) ?? []), id]);
  const sharedFiles = [...byHash.values()].filter((ids) => ids.length > 1);

  // Duplicate cards: rows with the same name, college, exam and year whose cards show the same
  // picture (pixel difference at 64 × 64). Rows that merely share a first name and college are
  // different students with different cards and are kept.
  const duplicates = {};
  const groups = new Map();
  for (const r of rankers) {
    if (!sizes.has(r.id)) continue;
    const key = [norm(r.name), norm(r.institution), r.exam, r.year].join("|");
    groups.set(key, [...(groups.get(key) ?? []), r.id]);
  }
  const thumb = (id) =>
    sharp(join(OUT_DIR, `${id}.webp`)).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const sameDuplicateRows = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const thumbs = await Promise.all(ids.map(thumb));
    for (let j = 1; j < ids.length; j += 1) {
      for (let i = 0; i < j; i += 1) {
        let diff = 0;
        for (let k = 0; k < thumbs[i].length; k += 1) diff += Math.abs(thumbs[i][k] - thumbs[j][k]);
        const meanDiff = diff / thumbs[i].length;
        sameDuplicateRows.push({ ids: [ids[i], ids[j]], meanDiff: Number(meanDiff.toFixed(1)) });
        if (meanDiff < 5 && !duplicates[ids[j]]) duplicates[ids[j]] = ids[i];
      }
    }
  }

  // 3. Selections-wall records → the ranker card of the same student (name + exam + year + college).
  const resultCards = {};
  const resultReport = [];
  for (const result of results) {
    const candidates = rankers.filter(
      (r) => sizes.has(r.id) && norm(r.name) === norm(result.name) && r.exam === result.exam && r.year === result.year,
    );
    const sameCollegeCandidates = candidates.filter((r) => sameCollege(r.institution, result));
    const pick = sameCollegeCandidates[0];
    if (pick) resultCards[result.id] = pick.id;
    resultReport.push({
      id: result.id,
      destination: result.destination ?? result.rankOrOutcome,
      matched: pick ? `${pick.id} (${pick.institution})` : null,
      nameMatchesOnly: candidates.filter((c) => !sameCollegeCandidates.includes(c)).map((c) => `${c.id} (${c.institution})`),
    });
  }

  // 4. Generated mapping (record order = content order).
  const block = (lines) => (lines ? `\n${lines}\n` : "");
  const rankerLines = rankers
    .filter((r) => sizes.has(r.id))
    .map((r) => `  "${r.id}": [${sizes.get(r.id).join(", ")}],`)
    .join("\n");
  const resultLines = Object.entries(resultCards)
    .map(([id, rankerId]) => `  "${id}": "${rankerId}",`)
    .join("\n");
  const duplicateLines = Object.entries(duplicates)
    .map(([id, firstId]) => `  "${id}": "${firstId}",`)
    .join("\n");
  writeFileSync(
    MAPPING_TS,
    `// GENERATED by scripts/import-result-cards.mjs — do not edit by hand; re-run the script.
//
// Result-card images (student photo, college and name) from Aspire's demo site
// (aspire2.thechunkmedia.com/rankers.json), D-031 / docs/demo-data-import.md → "Result cards".
// PERSONAL DATA with consent pending: the files live in private/result-cards/ (never public/)
// and are served only by GET /api/result-cards/[file] under the same rule as student names
// (canShowStudentName()); src/content/results.ts attaches them as \`photo\`.

/** Ranker record id → [width, height] of \`private/result-cards/<id>.webp\` (${sizes.size} cards). */
export const rankerCardSizes: Readonly<Record<string, readonly [width: number, height: number]>> = {
${rankerLines}
};

/**
 * Selections-wall record id (\`results\`) → the ranker record whose card shows the same student
 * (same name, exam and year, and the same college). Such a record shares that card.
 */
export const resultCardRankers: Readonly<Record<string, string>> = {${block(resultLines)}};

/**
 * Ranker id → the earlier ranker id with the same card (same name, college, exam and year, and
 * the same picture). Card lists show the earlier one only. Rows that share a name but show a
 * different student are not listed here.
 */
export const duplicateCards: Readonly<Record<string, string>> = {${block(duplicateLines)}};
`,
  );

  // 5. Summary.
  let totalBytes = 0;
  for (const id of sizes.keys()) totalBytes += statSync(join(OUT_DIR, `${id}.webp`)).size;
  const summary = {
    demoItems: items.length,
    rankerRecords: rankers.length,
    matched: matched.length,
    cardsOnDisk: sizes.size,
    downloadedThisRun: downloaded,
    failed,
    mismatched,
    demoOnly,
    recordsWithoutCard: recordsWithoutCard.map((r) => r.id),
    sharedFiles,
    sameNameRows: sameDuplicateRows,
    duplicateCards: duplicates,
    resultCards: resultReport,
    totalBytes,
  };
  console.log(
    [
      `Matched ${matched.length} of ${items.length} demo items to ranker records.`,
      `Demo items without a record: ${demoOnly.length}; records without a demo item: ${recordsWithoutCard.length}; field mismatches: ${mismatched.length}.`,
      `Cards on disk: ${sizes.size} (${downloaded} downloaded this run, ${failed.length} failed), ${(totalBytes / 1024 / 1024).toFixed(2)} MB.`,
      `Identical files shared by several records: ${sharedFiles.length} group(s).`,
      `Same name/college/exam/year rows: ${sameDuplicateRows.length} pair(s); same card: ${Object.keys(duplicates).length} (${Object.entries(duplicates).map(([id, first]) => `${id}=${first}`).join(", ")}).`,
      `Selections-wall records with a card: ${Object.keys(resultCards).length} of ${results.length}.`,
    ].join("\n"),
  );
  for (const m of mismatched) console.log(`  mismatch ${m.id}: ${m.problems.join("; ")}`);
  for (const f of failed) console.log(`  failed ${f.id}: ${f.error}`);
  if (reportPath) writeFileSync(resolve(reportPath), JSON.stringify(summary, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
