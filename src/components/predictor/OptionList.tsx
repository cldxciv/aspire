import { Badge, type BadgeVariant } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";
import { OPTION_TAGS, type CollegeOption, type OptionTag } from "@/lib/predictor/engine";
import { formatNumber } from "./format";

export type ResultMessages = Messages<"predictor">["result"];

const TAG_BADGE: Record<OptionTag, BadgeVariant> = { likely: "success", borderline: "warning", reach: "neutral" };
const TAG_BORDER: Record<OptionTag, string> = {
  likely: "border-l-[#2f9e6b]",
  borderline: "border-l-[#d9a520]",
  reach: "border-l-[#9aabbf]",
};

export function TagBadge({ tag, messages }: { tag: OptionTag; messages: ResultMessages }) {
  return <Badge variant={TAG_BADGE[tag]}>{messages.tags[tag]}</Badge>;
}

/** Institute / program in the page language when a Hindi name exists (names otherwise stay as listed). */
export function optionNames(option: CollegeOption, locale: Locale): { institute: string; program: string } {
  return {
    institute: (locale === "hi" && option.institute.nameHi) || option.institute.name,
    program: (locale === "hi" && option.programHi) || option.program,
  };
}

function OptionItem({
  option,
  locale,
  sample,
  messages,
}: {
  option: CollegeOption;
  locale: Locale;
  sample: boolean;
  messages: ResultMessages;
}) {
  const names = optionNames(option, locale);
  const scholarship = option.institute.kind === "Scholarship";
  const seat = [
    messages.quota[option.quota],
    messages.seatCategories[option.seatCategory],
    option.pool === "female" ? messages.femalePool : null,
    option.pwd ? messages.pwdSeat : null,
  ].filter(Boolean);
  const closing = format(sample ? messages.closingSample : messages.closing, {
    rank: formatNumber(option.closingRank, locale),
  });
  return (
    <li className={cn("rounded-control border border-line border-l-4 bg-white p-3 sm:p-4", TAG_BORDER[option.tag])}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-navy" lang={names.institute === option.institute.name ? "en" : undefined}>
            {scholarship ? names.program : names.institute}
          </p>
          {!scholarship && (
            <p className="text-sm text-ink" lang={names.program === option.program ? "en" : undefined}>
              {names.program}
            </p>
          )}
        </div>
        <TagBadge tag={option.tag} messages={messages} />
      </div>
      {!scholarship && <p className="mt-2 text-xs text-muted">{seat.join(" · ")}</p>}
      <p className="mt-1 text-xs text-muted">
        {closing} · {messages.rankTypes[option.rankType]}
      </p>
    </li>
  );
}

/** Options grouped by tag (likely → borderline → reach), each group a labelled list. */
export function OptionList({
  options,
  locale,
  sample,
  messages,
  headingLevel = "h4",
}: {
  options: CollegeOption[];
  locale: Locale;
  sample: boolean;
  messages: ResultMessages;
  headingLevel?: "h3" | "h4";
}) {
  const Heading = headingLevel;
  return (
    <div className="flex flex-col gap-5">
      {OPTION_TAGS.map((tag) => {
        const group = options.filter((option) => option.tag === tag);
        if (group.length === 0) return null;
        return (
          <div key={tag}>
            <Heading className="flex flex-wrap items-baseline gap-x-2 text-sm font-extrabold text-navy">
              <span>
                {messages.tags[tag]} ({formatNumber(group.length, locale)})
              </span>
              <span className="text-xs font-normal text-muted">{messages.tagHelp[tag]}</span>
            </Heading>
            <ul
              aria-label={format(messages.optionsListLabel, { tag: messages.tags[tag] })}
              className="mt-2 grid list-none gap-2 p-0 md:grid-cols-2"
            >
              {group.map((option) => (
                <OptionItem key={option.id} option={option} locale={locale} sample={sample} messages={messages} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
