"use client";

import { Plus, Route } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { format } from "@/i18n/format";
import type { CrmArea, RoutingMode, UnmatchedPlace } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, CrmDialog, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { leadOpsRequests } from "../lead-ops-api";
import { AreaEditor } from "./AreaEditor";
import { LegacyScopeReview } from "./LegacyScopeReview";
import { MergeDialog } from "./MergeDialog";
import { areasNeedingPeople, LOCALE_FREE_PATH, type AreaPersonView, type AreasMessages, type CentreOption } from "./model";
import { PlaceTester } from "./PlaceTester";
import { SetupFromCentre } from "./SetupFromCentre";
import { StaffAvailability } from "./StaffAvailability";
import { UnmatchedPlaces } from "./UnmatchedPlaces";

/** A titled region of the page (a landmark with its own h2). */
export function AreasSection({ id, title, intro, actions, children }: { id: string; title: string; intro?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-line bg-white p-4 shadow-soft sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {title}
          </h2>
          {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * "Areas & people" (`/crm/settings/areas`, docs/lead-routing-plan.md §13.6, §20). Everyone allowed
 * here (area heads, admins) reads; super admins (`canEdit`) change. Area heads may also mark their
 * members away and move their uncalled enquiries. The server re-checks every action.
 */
export function AreasManager({
  areas,
  people,
  routing,
  legacyManagerIds,
  unmatched,
  centres,
  canEdit,
  viewer,
  t,
}: {
  areas: CrmArea[];
  people: AreaPersonView[];
  routing: { mode: RoutingMode; version: number };
  legacyManagerIds: string[];
  /** Super admins only; null = not shown. */
  unmatched: UnmatchedPlace[] | null;
  centres: CentreOption[];
  canEdit: boolean;
  viewer: { userId: string; superAdmin: boolean; isManager: boolean; areaIds: string[] };
  t: AreasMessages;
}) {
  const a = t.a;
  const active = areas.filter((area) => area.active);
  const inactive = areas.filter((area) => !area.active);
  const canActOnPeople = viewer.superAdmin || viewer.isManager;

  return (
    <div className="space-y-5">
      <RoutingCard areas={active} routing={routing} canEdit={canEdit} t={t} />

      <AreasSection id="areas-list" title={a.sections.areas} actions={canEdit ? <AreaActions areas={active} centres={centres} t={t} /> : undefined}>
        <ul className="grid gap-4 lg:grid-cols-2">
          {active.map((area) => (
            <li key={area.id}>
              <AreaEditor area={area} areas={areas} people={people} centres={centres} canEdit={canEdit} t={t} />
            </li>
          ))}
        </ul>
      </AreasSection>

      {canEdit && (
        <AreasSection id="areas-setup" title={a.sections.setup} intro={a.setup.intro}>
          <SetupFromCentre areas={active} people={people} centres={centres} t={t} />
        </AreasSection>
      )}

      {canActOnPeople && (
        <AreasSection id="areas-people" title={a.sections.people} intro={a.staff.intro}>
          <StaffAvailability areas={areas} people={people} viewer={viewer} t={t} />
        </AreasSection>
      )}

      <AreasSection id="areas-tester" title={a.sections.tester} intro={a.tester.intro}>
        <PlaceTester areas={areas} t={t} />
      </AreasSection>

      <AreasSection id="areas-unmatched" title={a.sections.unmatched} intro={a.unmatched.intro}>
        {unmatched ? <UnmatchedPlaces places={unmatched} areas={active} t={t} /> : <p className="text-sm text-muted">{a.unmatched.saOnly}</p>}
      </AreasSection>

      <AreasSection id="areas-legacy" title={a.sections.legacy} intro={a.legacy.intro}>
        <LegacyScopeReview managers={people.filter((person) => legacyManagerIds.includes(person.userId))} areas={active} canEdit={canEdit} t={t} />
      </AreasSection>

      {inactive.length > 0 && (
        <AreasSection id="areas-off" title={a.sections.switchedOff}>
          <ul className="grid gap-4 lg:grid-cols-2">
            {inactive.map((area) => (
              <li key={area.id}>
                <AreaEditor area={area} areas={areas} people={people} centres={centres} canEdit={canEdit && !area.mergedInto} t={t} />
              </li>
            ))}
          </ul>
        </AreasSection>
      )}
    </div>
  );
}

/** Routing mode (areas / legacy), the summary line and "Re-route waiting enquiries". */
function RoutingCard({ areas, routing, canEdit, t }: { areas: CrmArea[]; routing: { mode: RoutingMode; version: number }; canEdit: boolean; t: AreasMessages }) {
  const id = useId();
  const r = t.a.routing;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const reroute = useCrmAction(t, LOCALE_FREE_PATH);
  const [mode, setMode] = useState<RoutingMode>(routing.mode);
  const modeLabel = (value: RoutingMode) => (value === "areas" ? r.areas : r.legacy);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await action.run(leadOpsRequests.setRoutingMode(mode, routing.version), r.saved);
  }

  const [rerouted, setRerouted] = useState("");

  async function runReroute() {
    setRerouted("");
    const data = await reroute.run<{ checked: number; routed: number; assigned: number }>(leadOpsRequests.rerouteOpenLeads());
    if (data) setRerouted(format(r.rerouted, data));
  }

  return (
    <AreasSection id="areas-routing" title={t.a.sections.routing} intro={r.intro}>
      <p className="mb-3 text-sm font-semibold text-[#354b66]">
        {format(r.current, { mode: modeLabel(routing.mode) })} · {format(r.summary, { areas: areas.length, gaps: areasNeedingPeople(areas) })}
      </p>
      {canEdit ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <form onSubmit={save} className="min-w-0 flex-1">
            <fieldset className="space-y-2">
              <legend className={labelClasses}>{r.modeLegend}</legend>
              {(["areas", "legacy"] as const).map((value) => (
                <label key={value} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-control border border-line px-3 py-2 has-checked:border-blue has-checked:bg-blue-soft">
                  <input type="radio" name={`${id}-mode`} value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1" />
                  <span>
                    <span className="block font-bold text-navy">{modeLabel(value)}</span>
                    <span className="block text-sm text-muted">{value === "areas" ? r.areasHint : r.legacyHint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" variant="dark" className="mt-3" disabled={action.pending || mode === routing.mode}>
              {action.pending ? t.common.saving : r.save}
            </Button>
            <ActionFeedback status={action.status} error={action.error} className="mt-2" />
          </form>
          <div className="lg:max-w-xs">
            <Button variant="outline" onClick={runReroute} disabled={reroute.pending}>
              <Route aria-hidden="true" className="size-4" />
              {reroute.pending ? t.common.saving : r.reroute}
            </Button>
            <p className="mt-1.5 text-sm text-muted">{r.rerouteHint}</p>
            <ActionFeedback status={rerouted} error={reroute.error} className="mt-2" />
          </div>
        </div>
      ) : null}
    </AreasSection>
  );
}

/** "Add an area" and "Merge areas" (super admins). */
function AreaActions({ areas, centres, t }: { areas: CrmArea[]; centres: CentreOption[]; t: AreasMessages }) {
  return (
    <>
      <CreateAreaButton centres={centres} t={t} />
      <MergeDialog areas={areas} t={t} />
    </>
  );
}

function CreateAreaButton({ centres, t }: { centres: CentreOption[]; t: AreasMessages }) {
  const id = useId();
  const c = t.a.create;
  const action = useCrmAction(t, LOCALE_FREE_PATH);
  const [open, setOpen] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [nameHi, setNameHi] = useState("");
  const [centre, setCentre] = useState("");
  const [issue, setIssue] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nameEn.trim() || !nameHi.trim() || nameEn.trim().length > 60 || nameHi.trim().length > 60) {
      setIssue(t.a.area.nameRequired);
      return;
    }
    setIssue(null);
    const created = await action.run(
      leadOpsRequests.createArea({ nameEn: nameEn.trim(), nameHi: nameHi.trim(), defaultCentreSlug: centre || null }),
      c.created,
      (failure) => (failure.status === 409 ? t.a.errors.areaTaken : null),
    );
    if (created) {
      setOpen(false);
      setNameEn("");
      setNameHi("");
      setCentre("");
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="size-4" />
        {c.open}
      </Button>
      <ActionFeedback status={open ? "" : action.status} error={open ? null : action.error} />
      <CrmDialog open={open} titleId={`${id}-title`} onClose={() => setOpen(false)}>
        <form onSubmit={submit} noValidate className="space-y-4 p-5 md:p-6">
          <h2 id={`${id}-title`} className="text-lg font-extrabold text-navy">
            {c.title}
          </h2>
          <p className="text-sm text-muted">{c.intro}</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-en`} className={labelClasses}>
              {t.a.area.nameEn}
            </label>
            <input id={`${id}-en`} value={nameEn} maxLength={60} onChange={(event) => setNameEn(event.target.value)} aria-invalid={issue ? true : undefined} aria-describedby={issue ? `${id}-issue` : undefined} className={fieldClasses} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-hi`} className={labelClasses}>
              {t.a.area.nameHi}
            </label>
            <input id={`${id}-hi`} lang="hi" value={nameHi} maxLength={60} onChange={(event) => setNameHi(event.target.value)} aria-invalid={issue ? true : undefined} aria-describedby={issue ? `${id}-issue` : undefined} className={fieldClasses} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-centre`} className={labelClasses}>
              {t.a.area.servingCentre} <span className="font-normal text-muted">{t.common.optional}</span>
            </label>
            <select id={`${id}-centre`} value={centre} onChange={(event) => setCentre(event.target.value)} className={fieldClasses}>
              <option value="">{t.a.area.none}</option>
              {centres.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {issue && (
            <p id={`${id}-issue`} role="alert" className="text-sm font-semibold text-danger">
              {issue}
            </p>
          )}
          <ActionFeedback status="" error={action.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="dark" disabled={action.pending}>
              {action.pending ? t.common.saving : c.submit}
            </Button>
          </div>
        </form>
      </CrmDialog>
    </>
  );
}
