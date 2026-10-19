import type { Metadata } from "next";
import { CtaBand } from "@/components/home/CtaBand";
import { DailyRoutine } from "@/components/hostels/DailyRoutine";
import { FeatureList } from "@/components/hostels/FeatureList";
import { HostelCampusCard } from "@/components/hostels/HostelCampusCard";
import { RoomTypes } from "@/components/hostels/RoomTypes";
import {
  AspireImage,
  ButtonLink,
  DemoBadge,
  EmptyState,
  Notice,
  PageHero,
  Section,
  SectionHeading,
} from "@/components/ui";
import { aspireAssets, type AspireAsset } from "@/content/aspire-assets";
import { getCentres, getHostelInfo, isPlaceholder } from "@/lib/data";

export const metadata: Metadata = {
  title: "Hostels",
  description:
    "Residential and hostel options for outstation students at Aspire IIT & Medical's campuses in Himachal Pradesh. Details are published once Aspire has verified them.",
  alternates: { canonical: "/hostels" },
};

/** Visible label for every illustration on this page (D-019: not Aspire's buildings). */
function IllustrativeFigure({ asset, alt }: { asset: AspireAsset; alt: string }) {
  return (
    <figure>
      <div className="overflow-hidden rounded-card bg-blue-soft" style={{ maxWidth: asset.maxWidth }}>
        <AspireImage asset={asset} alt={alt} />
      </div>
      <figcaption className="mt-1.5 text-xs font-semibold text-muted">
        Illustrative image — not an Aspire hostel or campus
      </figcaption>
    </figure>
  );
}

export default async function HostelsPage() {
  const [info, centres] = await Promise.all([getHostelInfo(), getCentres()]);
  const centreNames = new Map(centres.map((centre) => [centre.slug, centre.name]));

  if (!info) {
    return (
      <>
        <PageHero
          title="Hostels and residential life"
          lead="Residential options for students joining Aspire from outside their home town."
          crumbs={[{ label: "Hostels" }]}
        />
        <Section aria-labelledby="hostels-empty-title">
          <h2 id="hostels-empty-title" className="sr-only">
            Hostel information
          </h2>
          <EmptyState
            title="Hostel details will be published after verification"
            description="Aspire is confirming residential options, supervision and facilities at each campus. A counsellor can answer questions about accommodation in the meantime."
            action={<ButtonLink href="/admissions#enquiry">Talk to a counsellor</ButtonLink>}
          />
        </Section>
      </>
    );
  }

  const placeholder = isPlaceholder(info);
  const demo = placeholder ? <DemoBadge label="Demo" /> : undefined;
  const campuses = info.campuses.filter((campus) => centreNames.has(campus.centreSlug));
  const girlsCampuses = info.girlsResidency.centreSlugs.filter((slug) => centreNames.has(slug));
  const hasRooms = info.roomTypes.length > 0 || info.roomFeatures.length > 0;
  const hasDay = info.dailyRoutine.length > 0 || info.menuHighlights.length > 0;

  // Alternate white / surface backgrounds over the sections actually rendered.
  const order = ["intro", campuses.length > 0 && "campuses", "care", hasRooms && "rooms", hasDay && "day", "cta"].filter(
    Boolean,
  );
  const tone = (key: string) => (order.indexOf(key) % 2 === 0 ? "white" : "surface");

  return (
    <>
      <PageHero
        title="Hostels and residential life"
        lead={
          <>
            <p>Supervised residential options for outstation students, campus by campus.</p>
            {placeholder && <DemoBadge className="mt-3" />}
          </>
        }
        crumbs={[{ label: "Hostels" }]}
      >
        {campuses.length > 0 && <ButtonLink href="#hostels-by-campus">Hostels by campus</ButtonLink>}
        <ButtonLink href="/admissions#enquiry" variant="outline">
          Ask about accommodation
        </ButtonLink>
      </PageHero>

      <Section tone={tone("intro")} aria-labelledby="hostels-intro-title">
        {placeholder && (
          <Notice variant="warning" title="Demo information — pending verification" className="mb-8">
            This page was imported from Aspire&apos;s demo site for review. Facilities, supervision, capacities and
            routines have not yet been verified by Aspire. Fees are not shown; ask a counsellor for current details.
          </Notice>
        )}
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,456px)]">
          <div className="min-w-0">
            <SectionHeading
              id="hostels-intro-title"
              eyebrow="Who it's for"
              title={info.headline}
              description={info.audience}
              action={demo}
            />
            <FeatureList features={info.charter} />
          </div>
          <IllustrativeFigure
            asset={aspireAssets.campusBuilding}
            alt="Illustration of a hill-style residential building with mountains behind"
          />
        </div>
      </Section>

      {campuses.length > 0 && (
        <Section
          tone={tone("campuses")}
          id="hostels-by-campus"
          className="scroll-mt-28"
          aria-labelledby="hostels-campus-title"
        >
          <SectionHeading
            id="hostels-campus-title"
            title="Hostels by campus"
            description="Residential blocks, supervision and the warden desk at each campus."
            action={demo}
          />
          <ul className="grid gap-4 md:grid-cols-2">
            {campuses.map((campus) => (
              <li key={campus.centreSlug}>
                <HostelCampusCard
                  campus={campus}
                  centreName={centreNames.get(campus.centreSlug) ?? campus.centreSlug}
                  placeholder={placeholder}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section tone={tone("care")} aria-labelledby="hostels-care-title">
        <SectionHeading
          id="hostels-care-title"
          title="Safety, study and care"
          description="How residential students are supervised, supported and looked after."
          action={demo}
        />
        <FeatureList features={info.features} />

        {(info.girlsResidency.features.length > 0 || info.girlsResidency.summary) && (
          <div className="mt-10">
            <h3 className="text-[clamp(1.35rem,2.4vw,1.625rem)] font-extrabold tracking-tight text-navy">
              Girls&apos; residency
            </h3>
            <p className="mt-2 max-w-3xl text-ink">{info.girlsResidency.summary}</p>
            {girlsCampuses.length > 0 && (
              <p className="mt-2 text-sm text-muted">
                Campuses:{" "}
                {girlsCampuses.map((slug, i) => (
                  <span key={slug}>
                    {i > 0 && ", "}
                    <a href={`#hostel-${slug}`} className="font-semibold text-blue hover:underline">
                      {centreNames.get(slug)}
                    </a>
                  </span>
                ))}
              </p>
            )}
            <FeatureList features={info.girlsResidency.features} className="mt-4" />
          </div>
        )}
      </Section>

      {hasRooms && (
        <Section tone={tone("rooms")} aria-labelledby="hostels-rooms-title">
          <SectionHeading
            id="hostels-rooms-title"
            title="Rooms"
            description="Room options and what each room includes. Prices are not shown."
            action={demo}
          />
          <RoomTypes rooms={info.roomTypes} />
          {info.roomTypesNote && <p className="mt-3 text-sm text-muted">Note: {info.roomTypesNote}</p>}
          {info.roomFeatures.length > 0 && (
            <div className="mt-8">
              <h3 className="font-extrabold text-navy">Room features</h3>
              <FeatureList features={info.roomFeatures} columns={3} className="mt-3" />
            </div>
          )}
        </Section>
      )}

      {hasDay && (
        <Section tone={tone("day")} aria-labelledby="hostels-day-title">
          <SectionHeading
            id="hostels-day-title"
            title="A day in residence"
            description="The residential timetable for a typical day."
            action={demo}
          />
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <DailyRoutine items={info.dailyRoutine} />
            <div className="space-y-6">
              {/* 380px column, below the landscape's 419px maxWidth. */}
              <IllustrativeFigure
                asset={aspireAssets.himachalLandscape}
                alt="Illustration of a hill town on a forested Himachal slope"
              />
              {info.menuHighlights.length > 0 && (
                <div>
                  <h3 className="font-extrabold text-navy">From the menu</h3>
                  <FeatureList features={info.menuHighlights} columns={1} className="mt-3" />
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      <Section tone={tone("cta")} aria-labelledby="hostels-cta-title">
        <CtaBand
          headingId="hostels-cta-title"
          title="Planning to stay on campus?"
          description="Ask a counsellor about hostel availability, supervision and fees at your preferred campus."
          primary={{ label: "Book counselling", href: "/admissions#enquiry" }}
          secondary={{ label: "Find a campus", href: "/centres" }}
        />
      </Section>
    </>
  );
}
