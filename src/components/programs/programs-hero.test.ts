import { createElement, type FunctionComponent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProgramPage from "@/app/[lang]/(site)/programs/[slug]/page";
import ProgramsPage from "@/app/[lang]/(site)/programs/page";
import { LocaleProvider } from "@/i18n/client";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { getPrograms } from "@/lib/data";
import type { Program } from "@/lib/types";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import { programTracks, trackLabel } from "./exam-meta";
import { distinctChips, programBatchRows, programTrackLine } from "./program-hero";
import { ProgramsListHero } from "./ProgramHero";

/**
 * 2026-10-22 hero redesign, Programs pages: /programs gets the B frame (ridge art, gold eyebrow,
 * underlined headline) with the D program picker; /programs/[slug] the B frame with that
 * program's own facts and a batch-details card. Both locales, preview and production content.
 * Every value in the heroes comes from the program records or the page's messages.
 */

type Locale = "en" | "hi";

// Whole pages render here: allow for a loaded run.
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

const Provider = LocaleProvider as FunctionComponent<{ locale: Locale; children?: ReactNode }>;
async function render(locale: Locale, page: () => Promise<ReactElement>): Promise<string> {
  return withTestLang(locale, async () => renderToStaticMarkup(createElement(Provider, { locale }, await page())));
}

function programProps(locale: Locale, slug: string) {
  return {
    params: Promise.resolve({ lang: locale, slug }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/[lang]/programs/[slug]">;
}

/** The rich hero's markup: from its panel to the first page section after it. */
function heroOf(html: string): string {
  const start = html.indexOf('data-hero="rich"');
  expect(start, "renders the rich hero").toBeGreaterThan(-1);
  const end = html.indexOf("<section", start);
  // From the end of the panel's own tag, so its class names are not read as content.
  return html.slice(html.indexOf(">", start) + 1, end < 0 ? undefined : end);
}

const decode = (text: string) =>
  text.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
const h1Of = (html: string) => {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
  expect(match, "has an h1").not.toBeNull();
  return match![1];
};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const attr = (value: string) => value.replace(/&/g, "&amp;");

const en = messagesFor("en", "programs");

/** A Hindi hero carries none of the English hero strings. */
function expectNoEnglish(locale: Locale, hero: string) {
  if (locale !== "hi") return;
  for (const english of [
    en.list.heroTitle,
    en.list.heroLead,
    en.list.heroLeadPending,
    en.list.heroPicker.seeProgram,
    en.list.ctaPrimary,
    en.detail.enquire,
    en.detail.heroCard.eyebrow,
    en.detail.heroCard.cta,
    en.schedule.cta,
    "Demo",
    "Illustrative stock photo",
  ]) {
    expect(textOf(hero), english).not.toContain(english);
  }
}

/** Nothing on a hero may be an owner-to-fill slot or a missing value. */
function expectNoSlots(hero: string) {
  const text = textOf(hero);
  expect(text).not.toMatch(/\[[^\]]*\]/);
  expect(text).not.toMatch(/\b(undefined|NaN|null)\b/);
}

describe.each(["en", "hi"] as const)("programs list hero (%s)", (locale) => {
  const t = messagesFor(locale, "programs");
  const common = messagesFor(locale, "common");

  it("preview: B frame headline, the tracks eyebrow and the picker with the first program selected", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const programs = await getPrograms(undefined, locale);
    expect(programs.length).toBeGreaterThan(1);
    const html = await render(locale, () => ProgramsPage());
    const hero = heroOf(html);

    // One h1: the headline, with the highlight phrase underlined in its own span.
    expect(count(html, "<h1")).toBe(1);
    const h1 = h1Of(hero);
    expect(textOf(h1).trim()).toBe(t.list.heroTitle);
    expect(t.list.heroTitle).toContain(t.list.heroHighlight);
    expect(h1).toMatch(new RegExp(`<span[^>]*>${t.list.heroHighlight}</span>`));

    // Eyebrow: the tracks the listed programs prepare for, from the records.
    const tracks = programTrackLine(programs, t.tracks);
    expect(tracks).toBe([t.tracks.JEE, t.tracks.NEET, t.tracks.Foundation, t.tracks.Integrated].join(" · "));
    expect(hero).toContain(`>${tracks}</p>`);
    expect(hero).toContain(t.list.heroLead);
    expect(hero).not.toContain(t.list.heroLeadPending);
    expect(hero).toContain('aria-hidden="true"'); // decorative ridge art

    // Chips: one per program (its class level), the first one pressed in the server HTML.
    expect(hero).toContain(`role="group" aria-label="${t.list.heroPicker.group}"`);
    expect(count(hero, "aria-pressed=")).toBe(programs.length);
    expect(count(hero, 'aria-pressed="true"')).toBe(1);
    const [first] = programs;
    expect(hero).toMatch(new RegExp(`aria-pressed="true"[^>]*><span[^>]*>${first.classLevel}</span>`));

    // Facts strip and card of the first program: its own values only.
    expect(hero).toContain(`<dl aria-label="${attr(first.title)}"`);
    expect(hero).toContain(`>${first.classLevel}</dd>`);
    expect(hero).toContain(`>${first.duration}</dd>`);
    expect(hero).toContain(`>${format(t.units.upTo, { count: first.batchSize ?? Number.NaN })}</dd>`);
    expect(hero).toContain(`>${attr(first.title)}</p>`);
    expect(hero).toContain(attr(first.shortDescription));
    for (const highlight of first.highlights.slice(0, 3)) expect(hero).toContain(attr(highlight));
    const programHref = localePath(`/programs/${first.slug}`, locale);
    expect(hero).toMatch(new RegExp(`href="${programHref}"[^>]*>${t.list.heroPicker.seeProgram}<`));
    expect(hero).toMatch(new RegExp(`href="${localePath("/admissions#enquiry", locale)}"[^>]*>${t.list.ctaPrimary}<`));
    // No call to action of its own in the copy while the picker's card carries them (D mockup).
    expect(hero).not.toContain(`>${t.list.emptyCta}<`);

    // Without JavaScript: a link to every program in place of the chips.
    for (const program of programs) expect(hero).toContain(`href="${localePath(`/programs/${program.slug}`, locale)}"`);

    // Placeholder records: the DEMO badge under the lead (first screen on phones, before the
    // facts) and on the card.
    expect(count(hero, `>${common.labels.demoPending}<`)).toBe(2);
    expect(hero.indexOf(`>${common.labels.demoPending}<`)).toBeLessThan(hero.indexOf(`<dl aria-label="${attr(first.title)}"`));
    expectNoSlots(hero);
    expectNoEnglish(locale, hero);
  });

  it("production: the copy keeps one call to action and a labelled photo; no picker, no DEMO", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    expect(await getPrograms(undefined, locale)).toEqual([]);
    const html = await render(locale, () => ProgramsPage());
    const hero = heroOf(html);
    expect(textOf(h1Of(hero)).trim()).toBe(t.list.heroTitle);
    expect(hero).toContain(t.list.heroLeadPending);
    expect(hero).not.toContain(t.list.heroLead);
    expect(hero).toMatch(new RegExp(`href="${localePath("/admissions#enquiry", locale)}"[^>]*>${t.list.emptyCta}<`));
    expect(hero).not.toContain("aria-pressed");
    expect(hero).not.toContain(t.list.heroPicker.seeProgram);
    // No track eyebrow without listed programs.
    expect(hero).not.toContain(t.tracks.NEET);
    expect(hero).toContain("seminar-students-from-behind");
    expect(hero).toContain(`>${common.labels.illustrativeStockPhoto}<`);
    expect(hero).not.toContain(common.labels.demo);
    expectNoSlots(hero);
    expectNoEnglish(locale, hero);
  });
});

describe("programs list hero with few or look-alike programs (en)", () => {
  const t = messagesFor("en", "programs");
  const common = messagesFor("en", "common");
  const photo = { src: "/images/unused.webp", alt: "", width: 4, height: 3 };

  async function heroFor(programs: Program[]): Promise<string> {
    return heroOf(await render("en", async () => createElement(ProgramsListHero, { locale: "en", programs, photo, t, common })));
  }
  const chipsOf = (hero: string) => [...hero.matchAll(/aria-pressed="(?:true|false)"[^>]*><span[^>]*>([^<]*)<\/span>/g)].map((m) => decode(m[1]));
  const tracksOf = (program: Program) =>
    programTracks(program)
      .map((track) => trackLabel(track, t.tracks))
      .join(" · ");

  async function programsBySlug(...slugs: string[]): Promise<Program[]> {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const all = await getPrograms(undefined, "en");
    return slugs.map((slug) => {
      const program = all.find((p) => p.slug === slug);
      expect(program, slug).toBeDefined();
      return program!;
    });
  }

  it("one program: no chips, so the lead does not ask the visitor to pick; card and badge stay", async () => {
    const [only] = await programsBySlug("junior-foundation");
    const hero = await heroFor([only]);
    expect(hero).toContain(t.list.heroLeadPending);
    expect(hero).not.toContain(t.list.heroLead);
    expect(hero).not.toContain("aria-pressed");
    expect(hero).not.toContain(`role="group"`);
    expect(hero).toContain(`>${attr(only.title)}</p>`);
    expect(count(hero, `>${common.labels.demoPending}<`)).toBe(2);
  });

  it("programs sharing a class level get distinct chips: the tracks, else the title", async () => {
    const [pinnacle, foundation, intensive, dropper] = await programsBySlug(
      "jee-neet-pinnacle-2027",
      "junior-foundation",
      "class-12-intensive",
      "dropper-special",
    );
    const classLevel = pinnacle.classLevel;
    // Same class, different tracks; and two more with the same class and the same tracks.
    const programs = [pinnacle, { ...foundation, classLevel }, { ...intensive, classLevel }, { ...dropper, classLevel }];
    expect(tracksOf(intensive)).toBe(tracksOf(dropper));
    const chips = chipsOf(await heroFor(programs));
    expect(chips).toEqual([
      `${classLevel} · ${tracksOf(pinnacle)}`,
      `${classLevel} · ${tracksOf(foundation)}`,
      intensive.title,
      dropper.title,
    ]);
    expect(new Set(chips).size).toBe(programs.length);
  });
});

describe.each(["en", "hi"] as const)("program page hero (%s)", (locale) => {
  const t = messagesFor(locale, "programs");
  const common = messagesFor(locale, "common");

  it("shows that program's own title, tracks, facts and batch details, and no picker", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const programs = await getPrograms(undefined, locale);
    for (const program of programs) {
      const html = await render(locale, () => ProgramPage(programProps(locale, program.slug)));
      const hero = heroOf(html);
      expect(count(html, "<h1"), program.slug).toBe(1);
      expect(textOf(h1Of(hero)).trim()).toBe(program.title);
      const tracks = programTracks(program)
        .map((track) => trackLabel(track, t.tracks))
        .join(" · ");
      expect(hero).toContain(`>${tracks}</p>`);
      expect(hero).toContain(attr(program.shortDescription));
      expect(hero).not.toContain("aria-pressed");

      // Calls to action: enquire (gold) and all programs.
      expect(hero).toMatch(new RegExp(`href="${localePath("/admissions#enquiry", locale)}"[^>]*>${t.detail.enquire}<`));
      expect(hero).toMatch(new RegExp(`href="${localePath("/programs", locale)}"[^>]*>${t.detail.allPrograms}<`));

      // Facts strip: class, duration, batch size as the record states them.
      expect(hero).toContain(`<dl aria-label="${t.detail.heroFacts}"`);
      expect(hero).toContain(`>${program.classLevel}</dd>`);
      expect(hero).toContain(`>${program.duration}</dd>`);
      expect(hero).toContain(`>${format(t.units.upTo, { count: program.batchSize ?? Number.NaN })}</dd>`);

      // Card: batch details from the record (no start date, seats or unverified fee), a jump to
      // "Schedule & fees" (which exists on the page) and the counsellor link.
      expect(hero).toContain(`>${t.detail.heroCard.eyebrow}</p>`);
      const rows = programBatchRows(program, t).filter((row) => row.value !== undefined);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(hero).toContain(`<dt class="text-muted">${row.label}</dt>`);
      expect(hero).toContain(`>${attr(program.cohortName ?? "")}</dd>`);
      expect(hero).toContain(`>${program.deliveryMode}</dd>`);
      if (!program.feeDisplay) expect(hero).not.toContain(`>${t.schedule.facts.fees}</dt>`);
      expect(hero).toMatch(new RegExp(`href="#program-schedule"[^>]*>${t.detail.heroCard.cta.replace(/&/g, "&amp;")}<`));
      expect(html).toContain('id="program-schedule"');
      expect(hero).toMatch(new RegExp(`href="${localePath("/contact", locale)}"[^>]*>${t.schedule.cta}<`));

      // DEMO: the placeholder record is labelled in the copy and on the card.
      expect(count(hero, `>${common.labels.demoPending}<`)).toBe(2);
      // No hero photo any more; the page's photos start below the hero.
      expect(hero).not.toContain("<img");
      expectNoSlots(hero);
      expectNoEnglish(locale, hero);
    }
  });
});

describe("program hero helpers", () => {
  const t = messagesFor("en", "programs");
  const base = { exam: "JEE", status: "published" } as Pick<Program, "exam" | "status">;

  it("track line follows the display order and is empty without programs", () => {
    expect(programTrackLine([])).toBe("");
    expect(programTrackLine([{ exam: "NEET", tracks: ["NEET", "JEE"] }, { exam: "Foundation" }], t.tracks)).toBe(
      "IIT JEE · NEET · Foundation",
    );
  });

  it("distinct chips: unique labels stay, shared ones get their tracks, then the title", () => {
    const view = (chip: string, eyebrow: string, title: string) => ({ chip, eyebrow, title });
    const unique = [view("Class XI", "NEET", "A"), view("Class XII", "NEET", "B")];
    expect(distinctChips(unique)[0]).toBe(unique[0]);
    expect(distinctChips(unique).map((v) => v.chip)).toEqual(["Class XI", "Class XII"]);
    expect(
      distinctChips([
        view("Class XI", "IIT JEE", "A"),
        view("Class XI", "NEET", "B"),
        view("Class XI", "", "C"),
        view("Class XII", "NEET", "D"),
        view("Class XII", "NEET", "E"),
        view("Class 8", "Foundation", "F"),
      ]).map((v) => v.chip),
    ).toEqual(["Class XI · IIT JEE", "Class XI · NEET", "Class XI", "D", "E", "Class 8"]);
    expect(distinctChips([])).toEqual([]);
  });

  it("batch rows keep only stated values, flag placeholders and format the daily hours", () => {
    const rows = programBatchRows({ ...base, deliveryMode: "Offline classroom", dailyContactHours: 5.5 }, t);
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ["Batch / cohort", undefined],
      ["Delivery mode", "Offline classroom"],
      ["Daily contact hours", "5.5 hrs per day"],
      ["Fees", undefined],
    ]);
    expect(rows.every((row) => row.placeholder === false)).toBe(true);
    const nan = programBatchRows({ ...base, status: "placeholder", dailyContactHours: Number.NaN }, t);
    expect(nan[2].value).toBeUndefined();
    expect(nan.every((row) => row.placeholder)).toBe(true);
  });
});
