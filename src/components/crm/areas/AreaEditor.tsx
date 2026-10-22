"use client";

import { Pencil } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import type { CrmArea } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { formatDate } from "../format";
import { leadOpsRequests } from "../lead-ops-api";
import { AliasEditor } from "./AliasEditor";
import { areaName, centreName, coverageBadges, LOCALE_FREE_PATH, nameOfArea, otherAreaName, type AreaPersonView, type AreasMessages, type Badge, type CentreOption } from "./model";
import { PeoplePicker } from "./PeoplePicker";

const badgeStyles: Record<Badge["kind"], string> = {
  danger: "border-[#f5c2bd] bg-danger-soft text-danger",
  warning: "border-[#f2dfa0] bg-gold-soft text-[#5c4a12]",
  info: "border-[#d7e7fb] bg-blue-soft text-[#0755b5]",
  neutral: "border-line bg-[#f1f3f6] text-[#4a5568]",
};

/**
 * One area as a card: names, coverage badges (text, never colour alone), serving centre, centres,
 * people and place names. Super admins get "Edit area" and "Choose people".
 */
export function AreaEditor({
  area,
  areas,
  people,
  centres,
  canEdit,
  t,
}: {
  area: CrmArea;
  areas: CrmArea[];
  people: AreaPersonView[];
  centres: CentreOption[];
  canEdit: boolean;
  t: AreasMessages;
}) {
  const locale = useLocale();
  const a = t.a.area;
  const name = areaName(area, locale);
  const other = otherAreaName(area, locale);
  const badges = coverageBadges(area, areas, locale, t.a);
  const heads = area.members.filter((member) => member.crmRole === "manager");
  const executives = area.members.filter((member) => member.crmRole !== "manager");

  const memberLine = (member: CrmArea["members"][number]) => {
    const notes = [
      member.centreSlug ? format(a.tiedTo, { centre: centreName(centres, member.centreSlug) }) : null,
      member.crmRole === "manager" && member.takesLeads ? a.takesCalls : null,
      member.awayUntil ? format(a.awayUntil, { date: formatDate(member.awayUntil, locale) ?? "" }) : null,
      !member.active || member.disabled ? a.notActive : null,
    ].filter(Boolean);
    return (
      <li key={member.userId} className="text-sm">
        <span className="font-semibold text-ink">{member.displayName}</span>
        {notes.length > 0 && <span className="text-muted"> · {notes.join(" · ")}</span>}
      </li>
    );
  };

  return (
    <article aria-labelledby={`area-${area.id}`} className="h-full rounded-card border border-line bg-[#fbfcfe] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`area-${area.id}`} className="text-base font-extrabold text-navy" lang={locale === "hi" ? "hi" : undefined}>
            {name}
          </h3>
          {other && (
            <p className="text-xs text-muted" lang={locale === "hi" ? "en" : "hi"}>
              {format(a.otherName, { name: other })}
            </p>
          )}
        </div>
        {canEdit && <AreaEditButton area={area} areas={areas} centres={centres} t={t} />}
      </div>

      {badges.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <li key={badge.text} className={cn("rounded-full border px-2 py-0.5 text-xs font-bold", badgeStyles[badge.kind])}>
              {badge.text}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-bold text-[#354b66]">{a.servingCentre}</dt>
        <dd>{area.defaultCentreSlug ? centreName(centres, area.defaultCentreSlug) : a.none}</dd>
        <dt className="font-bold text-[#354b66]">{a.centres}</dt>
        <dd>{area.centres.length > 0 ? area.centres.map((slug) => centreName(centres, slug)).join(", ") : a.noCentres}</dd>
      </dl>

      <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-extrabold text-navy">{a.people}</h4>
          {canEdit && area.active && <PeoplePicker area={area} people={people} centres={centres} t={t} />}
        </div>
        {area.members.length === 0 ? (
          <p className="text-sm text-muted">{a.noPeople}</p>
        ) : (
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{a.head}</p>
              <ul className="space-y-0.5">{heads.length > 0 ? heads.map(memberLine) : <li className="text-sm text-muted">{t.common.none}</li>}</ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{a.executive}</p>
              <ul className="space-y-0.5">{executives.length > 0 ? executives.map(memberLine) : <li className="text-sm text-muted">{t.common.none}</li>}</ul>
            </div>
          </div>
        )}
      </div>

      <AliasEditor area={area} canEdit={canEdit && area.active} t={t} />
    </article>
  );
}

/** "Edit area" (super admins): names, serving centre, centres (moved from other areas), in use. */
function AreaEditButton({ area, areas, centres, t }: { area: CrmArea; areas: CrmArea[]; centres: CentreOption[]; t: AreasMessages }) {
  const id = useId();
  const locale = useLocale();
  const a = t.a.area;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [open, setOpen] = useState(false);
  const [nameEn, setNameEn] = useState(area.nameEn);
  const [nameHi, setNameHi] = useState(area.nameHi);
  const [serving, setServing] = useState(area.defaultCentreSlug ?? "");
  const [owned, setOwned] = useState<string[]>(area.centres);
  const [active, setActive] = useState(area.active);
  const [issue, setIssue] = useState<string | null>(null);

  const ownerOf = (slug: string) => areas.find((item) => item.id !== area.id && item.centres.includes(slug)) ?? null;
  const moving = owned.filter((slug) => !area.centres.includes(slug) && ownerOf(slug));

  function reset() {
    setNameEn(area.nameEn);
    setNameHi(area.nameHi);
    setServing(area.defaultCentreSlug ?? "");
    setOwned(area.centres);
    setActive(area.active);
    setIssue(null);
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nameEn.trim() || !nameHi.trim() || nameEn.trim().length > 60 || nameHi.trim().length > 60) {
      setIssue(a.nameRequired);
      return;
    }
    setIssue(null);
    const saved = await action.run(
      leadOpsRequests.updateArea(area.id, { nameEn: nameEn.trim(), nameHi: nameHi.trim(), defaultCentreSlug: serving || null, centres: owned, active }),
      a.saved,
    );
    if (saved) setOpen(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={reset} aria-label={format(a.editTitle, { area: areaName(area, locale) })}>
        <Pencil aria-hidden="true" className="size-3.5" />
        {a.edit}
      </Button>
      <ActionFeedback status={open ? "" : action.status} error={open ? null : action.error} className="basis-full" />
      <CrmDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)}>
        <form onSubmit={save} noValidate className="space-y-4 p-5 md:p-6">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {format(a.editTitle, { area: areaName(area, locale) })}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-en`} className={labelClasses}>
                {a.nameEn}
              </label>
              <input id={`${id}-en`} value={nameEn} maxLength={60} onChange={(event) => setNameEn(event.target.value)} aria-invalid={issue ? true : undefined} aria-describedby={issue ? `${id}-issue` : undefined} className={fieldClasses} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-hi`} className={labelClasses}>
                {a.nameHi}
              </label>
              <input id={`${id}-hi`} lang="hi" value={nameHi} maxLength={60} onChange={(event) => setNameHi(event.target.value)} aria-invalid={issue ? true : undefined} aria-describedby={issue ? `${id}-issue` : undefined} className={fieldClasses} />
            </div>
          </div>
          {issue && (
            <p id={`${id}-issue`} role="alert" className="text-sm font-semibold text-danger">
              {issue}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-serving`} className={labelClasses}>
              {a.servingCentre}
            </label>
            <select id={`${id}-serving`} value={serving} onChange={(event) => setServing(event.target.value)} aria-describedby={`${id}-serving-hint`} className={fieldClasses}>
              <option value="">{a.none}</option>
              {centres.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p id={`${id}-serving-hint`} className="text-sm text-muted">
              {a.servingCentreHint}
            </p>
          </div>
          <fieldset className="space-y-1.5">
            <legend className={labelClasses}>{a.centres}</legend>
            <p className="text-sm text-muted">{a.centresHint}</p>
            {centres.map((option) => (
              <label key={option.value} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={owned.includes(option.value)}
                  onChange={(event) => setOwned((current) => (event.target.checked ? [...current, option.value] : current.filter((slug) => slug !== option.value)))}
                  className="size-4"
                />
                {option.label}
              </label>
            ))}
            {moving.length > 0 && (
              <ul role="status" className="space-y-0.5 text-sm font-semibold text-[#5c4a12]">
                {moving.map((slug) => (
                  <li key={slug}>{format(a.movesCentre, { centre: centreName(centres, slug), area: nameOfArea(areas, ownerOf(slug)?.id ?? null, locale) })}</li>
                ))}
              </ul>
            )}
          </fieldset>
          {!area.mergedInto && (
            <label className="flex min-h-11 items-start gap-2">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="mt-1 size-4" aria-describedby={`${id}-active-hint`} />
              <span>
                <span className="font-bold text-navy">{a.active}</span>
                <span id={`${id}-active-hint`} className="block text-sm text-muted">
                  {a.activeHint}
                </span>
              </span>
            </label>
          )}
          <ActionFeedback status="" error={action.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending}>
              {action.pending ? t.common.saving : a.save}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </>
  );
}
