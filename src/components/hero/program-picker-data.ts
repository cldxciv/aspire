/**
 * View models for D · program picker (`ProgramPicker`) and the program card / facts of a program
 * page's hero, built on the server from `getPrograms()` / `getProgram()` (already in the page
 * locale) and passed to the client island as plain data. Pure. Unit-tested in `hero-data.test.ts`.
 *
 * Honesty: every fact is a field of the program record, as stated (class level, duration, batch
 * size); an absent field is left out, never estimated. Programs carry no start date, seats or fee
 * here, so the hero shows none (`Program.feeDisplay` only when verified, and it is not a hero fact).
 */
import { programTracks, trackLabel, type TrackLabels } from "@/components/programs/exam-meta";
import { format } from "@/i18n/format";
import type { Program } from "@/lib/types";
import type { HeroFact } from "./HeroStats";
import { isFilled } from "./hero-text";

/** One program as the picker and the hero program card show it. */
export interface PickerProgram {
  slug: string;
  /** Chip text: the page's `chip`, else the class level as stated, else the title. */
  chip: string;
  /** Track labels joined with " · ", e.g. "Integrated · JEE · NEET". */
  eyebrow: string;
  title: string;
  summary?: string;
  /** Up to three facts with a value (class, duration, batch size). */
  facts: HeroFact[];
  /** Up to `maxHighlights` of the record's own highlights. */
  highlights: string[];
  /** The program's page. */
  href: string;
  /** Placeholder record: render the DEMO badge (D-005). */
  placeholder: boolean;
}

/** `programs.card.facts` (class / duration / batchSize) and `programs.units.upTo`, in the page locale. */
export type PickerFactLabels = { class: string; duration: string; batchSize: string };

export function programHeroFacts(
  program: Pick<Program, "classLevel" | "duration" | "batchSize">,
  labels: PickerFactLabels,
  upTo: string,
): HeroFact[] {
  const facts: HeroFact[] = [
    { label: labels.class, value: program.classLevel },
    { label: labels.duration, value: program.duration },
    {
      label: labels.batchSize,
      value: typeof program.batchSize === "number" && Number.isFinite(program.batchSize) ? format(upTo, { count: program.batchSize }) : undefined,
    },
  ];
  return facts.filter((fact) => isFilled(fact.value));
}

/**
 * One program for the picker / hero card. `href` is the program page in the page locale
 * (`localePath(`/programs/${slug}`, locale)`); `summary` picks the record's short description
 * (default) or its target audience.
 */
export function pickerProgram(
  program: Program,
  options: {
    href: string;
    factLabels: PickerFactLabels;
    /** `programs.units.upTo` ("Up to {count}"). */
    upTo: string;
    trackLabels?: TrackLabels;
    chip?: string;
    summary?: "short" | "audience" | "none";
    maxHighlights?: number;
  },
): PickerProgram {
  const { summary = "short", maxHighlights = 3 } = options;
  const text = summary === "audience" ? program.targetAudience : summary === "short" ? program.shortDescription : undefined;
  const chip = options.chip?.trim() || (isFilled(program.classLevel) ? program.classLevel.trim() : program.title);
  return {
    slug: program.slug,
    chip,
    eyebrow: programTracks(program)
      .map((track) => trackLabel(track, options.trackLabels))
      .join(" · "),
    title: program.title,
    ...(isFilled(text) ? { summary: text.trim() } : {}),
    facts: programHeroFacts(program, options.factLabels, options.upTo),
    highlights: program.highlights.filter((h) => isFilled(h)).slice(0, Math.max(maxHighlights, 0)),
    href: options.href,
    placeholder: program.status === "placeholder",
  };
}

/** The slug selected before any choice: `preferred` when it is in the list, else the first program. */
export function defaultProgramSlug(programs: readonly Pick<PickerProgram, "slug">[], preferred?: string): string | undefined {
  return programs.find((p) => p.slug === preferred)?.slug ?? programs[0]?.slug;
}
