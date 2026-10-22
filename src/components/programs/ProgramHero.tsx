import Image from "next/image";
import {
  HeroAction,
  HeroCopy,
  HeroFactsStrip,
  HeroFrame,
  HeroPanel,
  NextBatchCard,
  ProgramPicker,
  pickerProgram,
} from "@/components/hero";
import { DemoBadge } from "@/components/ui/Feedback";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import type { ImageAsset, Program } from "@/lib/types";
import { distinctChips, programBatchRows, programTrackLine } from "./program-hero";

/** The fallback photo sits in the picker's right column: ~44vw on tablets, ~37% of the container from lg. */
const PHOTO_SIZES = "(min-width: 1200px) 440px, (min-width: 1024px) 38vw, (min-width: 768px) 44vw, 100vw";

/** In-page anchor of the "Schedule & fees" heading on a program page (`ScheduleFees headingId`). */
export const PROGRAM_SCHEDULE_ID = "program-schedule";

type ProgramMessages = Messages<"programs">;
type CommonMessages = Messages<"common">;

function programView(program: Program, locale: Locale, t: ProgramMessages) {
  return pickerProgram(program, {
    href: localePath(`/programs/${program.slug}`, locale),
    factLabels: t.card.facts,
    upTo: t.units.upTo,
    trackLabels: t.tracks,
  });
}

/** A labelled stock photo in a fixed 4:3 box (no layout shift), preloaded: it is the hero's largest image. */
function HeroPhoto({ image, label }: { image: ImageAsset; label: string }) {
  return (
    <figure className="relative m-0">
      <div className="relative aspect-4/3 overflow-hidden rounded-card shadow-card ring-1 ring-white/15">
        <Image
          src={image.src}
          alt={image.alt}
          fill
          preload
          fetchPriority="high"
          sizes={PHOTO_SIZES}
          className="object-cover"
        />
      </div>
      <figcaption className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
        {label}
      </figcaption>
    </figure>
  );
}

/**
 * /programs hero (B frame + D picker): ridge art, the tracks the listed programs prepare for as a
 * gold eyebrow, the headline with its gold underline, then one chip per program (its class level)
 * switching a facts strip and the program card ("See the full program" + "Book counselling").
 * The first program is selected in the server HTML; without JavaScript a list of program links
 * shows instead of the chips. Chips stay distinct (`distinctChips`), and the lead asks the visitor
 * to pick only when there are chips (two or more programs). Placeholder records put the DEMO badge
 * under the lead as well as on the card. With no program listed (production while the records are
 * placeholders) the copy keeps one call to action and a labelled stock photo sits beside it.
 */
export function ProgramsListHero({
  locale,
  programs,
  photo,
  t,
  common,
}: {
  locale: Locale;
  programs: readonly Program[];
  /** Beside the copy when no program is listed. */
  photo: ImageAsset;
  t: ProgramMessages;
  common: CommonMessages;
}) {
  const tl = t.list;
  const views = distinctChips(programs.map((program) => programView(program, locale, t)));
  const enquiry = localePath("/admissions#enquiry", locale);
  const listed = views.length > 0;
  // The picker shows chips only for two or more programs: with one, the lead must not ask to pick.
  const leadText = views.length > 1 ? tl.heroLead : tl.heroLeadPending;
  // Placeholder facts sit in the copy column under the chips; on phones the card (and its badge)
  // comes a screen later, so the copy carries the DEMO badge too (as on a program page).
  const demo = views.some((view) => view.placeholder);
  return (
    <HeroPanel art="ridges">
      <ProgramPicker
        copy={
          <HeroCopy
            title={tl.heroTitle}
            highlight={tl.heroHighlight}
            highlightStyle="underline"
            size="xl"
            eyebrow={programTrackLine(programs, t.tracks) || undefined}
            eyebrowStyle="caps"
            lead={
              demo ? (
                <>
                  <p className="m-0">{leadText}</p>
                  <DemoBadge label={common.labels.demoPending} className="mt-3" />
                </>
              ) : (
                leadText
              )
            }
            crumbs={[{ label: tl.crumb }]}
            homeLabel={common.labels.home}
            homeHref={localePath("/", locale)}
            actions={listed ? undefined : <HeroAction href={enquiry}>{tl.emptyCta}</HeroAction>}
          />
        }
        programs={views}
        labels={{
          group: tl.heroPicker.group,
          seeProgram: tl.heroPicker.seeProgram,
          selected: tl.heroPicker.selected,
          demo: common.labels.demoPending,
        }}
        secondary={{ label: tl.ctaPrimary, href: enquiry }}
        fallback={<HeroPhoto image={photo} label={common.labels.illustrativeStockPhoto} />}
      />
    </HeroPanel>
  );
}

/**
 * /programs/[slug] hero (B frame, no picker): ridge art, the program's tracks as the eyebrow, its
 * title as the headline, its short description, "Enquire about this program" + "All programs",
 * and the program's own facts (class, duration, batch size) under them. Beside it, the white card
 * with the batch details the record states (batch / cohort, delivery mode, daily teaching, fees
 * once verified) and a jump to "Schedule & fees". Programs carry no start date or seats, so the
 * card has no date. Placeholder records carry the DEMO badge (in the copy and on the card).
 */
export function ProgramDetailHero({
  locale,
  program,
  t,
  common,
}: {
  locale: Locale;
  program: Program;
  t: ProgramMessages;
  common: CommonMessages;
}) {
  const td = t.detail;
  const view = programView(program, locale, t);
  const placeholder = view.placeholder;
  return (
    <HeroFrame
      art="ridges"
      layout="editorial"
      // Program titles are long record strings: the smaller headline keeps them to a few lines.
      size="lg"
      eyebrow={view.eyebrow}
      eyebrowStyle="caps"
      title={program.title}
      lead={
        view.summary || placeholder ? (
          <>
            {view.summary && <p className="m-0">{view.summary}</p>}
            {placeholder && <DemoBadge label={common.labels.demoPending} className="mt-3" />}
          </>
        ) : undefined
      }
      crumbs={[{ label: t.list.crumb, href: localePath("/programs", locale) }, { label: program.title }]}
      homeLabel={common.labels.home}
      homeHref={localePath("/", locale)}
      actions={
        <>
          <HeroAction href={localePath("/admissions#enquiry", locale)}>{td.enquire}</HeroAction>
          <HeroAction href={localePath("/programs", locale)} variant="secondary">
            {td.allPrograms}
          </HeroAction>
        </>
      }
      below={<HeroFactsStrip facts={view.facts} label={td.heroFacts} />}
      aside={
        <NextBatchCard
          eyebrow={td.heroCard.eyebrow}
          rows={programBatchRows(program, t)}
          action={{ label: td.heroCard.cta, href: `#${PROGRAM_SCHEDULE_ID}` }}
          secondary={{ label: t.schedule.cta, href: localePath("/contact", locale) }}
          demoLabel={common.labels.demoPending}
          placeholder={placeholder}
        />
      }
    />
  );
}
