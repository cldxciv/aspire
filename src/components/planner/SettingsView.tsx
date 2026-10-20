"use client";

import { BellRing, CalendarArrowDown, CloudCheck, Download, Smartphone, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useStandalone } from "@/components/pwa/install-store";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { format } from "@/i18n/format";
import type { DateKey } from "@/lib/planner/dates";
import { buildIcs, revisionEvents } from "@/lib/planner/ics";
import type { PlannerSettings, PlannerState } from "@/lib/planner/state";
import type { StudyPlan } from "@/lib/planner/types";
import { useBrowserValue } from "./hooks";
import { minutesToTime, timeToMinutes, type PlannerData, type PlannerMessages } from "./model";
import { PlanForm } from "./PlanForm";
import type { PlannerSnapshot } from "./planner-store";

function Card({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-card border border-line bg-white p-5 shadow-soft">
      <h3 id={id} className="flex items-center gap-2 font-extrabold text-navy">
        {icon}
        {title}
      </h3>
      <div className="mt-2 grid gap-3 text-sm text-muted">{children}</div>
    </section>
  );
}

type Permission = NotificationPermission | "unsupported";

function readPermission(): Permission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export function SettingsView({
  t,
  data,
  today,
  state,
  plan,
  snapshot,
  ranchoAppHref,
  onSettings,
  onImport,
  onDeclineImport,
  onReset,
}: {
  t: PlannerMessages;
  data: PlannerData;
  today: DateKey;
  state: PlannerState;
  plan: StudyPlan | null;
  snapshot: PlannerSnapshot;
  /** /rancho in the page's locale: the installable Rancho app (the planner has no install prompt of its own). */
  ranchoAppHref: string;
  onSettings: (settings: PlannerSettings) => void;
  onImport: () => void;
  onDeclineImport: () => void;
  onReset: () => void;
}) {
  const settings = state.settings;
  // Running as the installed Rancho app: no "Get the Rancho app" card (false on the server).
  const standalone = useStandalone();
  const initialPermission = useBrowserValue(readPermission, "default");
  const [permission, setPermission] = useState<Permission | null>(null);
  const currentPermission = permission ?? initialPermission;
  const [exported, setExported] = useState<number | null>(null);
  const [planSaved, setPlanSaved] = useState(false);

  function exportIcs() {
    if (!plan || !settings) return;
    const events = revisionEvents(plan.days, {
      from: today,
      startMinutes: settings.reminderMinutes,
      text: {
        spaced: t.settings.icsSpaced,
        revision: t.settings.icsRevision,
        mock: t.settings.icsMock,
        describe: (ids) => format(t.settings.icsTopics, { topics: ids.map((topicId) => data.topics[topicId]?.name ?? topicId).join(", ") }),
      },
    });
    const ics = buildIcs(events, { calendarName: t.settings.icsCalendarName, now: Date.now() });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "aspire-study-plan.ics";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setExported(events.length);
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined" || !settings) return;
    const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setPermission(result);
    if (result === "granted") onSettings({ ...settings, notifications: true });
  }

  const syncText =
    snapshot.mode === "guest"
      ? t.settings.syncGuest
      : {
          checking: t.settings.syncChecking,
          local: t.settings.syncSaved,
          saving: t.settings.syncSaving,
          saved: t.settings.syncSaved,
          offline: t.settings.syncOffline,
          error: t.settings.syncError,
        }[snapshot.sync];

  return (
    <div className="grid gap-6">
      <h2 className="font-serif text-2xl font-bold text-navy">{t.settings.title}</h2>

      <div className="rounded-card border border-line bg-white p-5 shadow-soft">
        {/* Remounts when the settings change (also from another device), so the form shows them. */}
        <PlanForm
          key={JSON.stringify(settings)}
          t={t}
          data={data}
          today={today}
          settings={settings}
          onSubmit={(next) => {
            onSettings(next);
            setPlanSaved(true);
          }}
        />
        {planSaved && (
          <Notice variant="success" role="status" className="mt-4">
            {t.form.saved}
          </Notice>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card id="planner-ics" icon={<CalendarArrowDown aria-hidden="true" className="size-5 text-blue" />} title={t.settings.calendarTitle}>
          <p>{t.settings.calendarBody}</p>
          {settings && (
            <label className="block max-w-48 font-semibold text-navy">
              {t.settings.reminderTime}
              <input
                type="time"
                step={300}
                value={minutesToTime(settings.reminderMinutes)}
                onChange={(e) => {
                  const minutes = timeToMinutes(e.target.value);
                  if (minutes !== null) onSettings({ ...settings, reminderMinutes: minutes });
                }}
                className="mt-1 block min-h-11 w-full rounded-control border border-[#b9cbe0] bg-white px-3 py-2 text-sm text-ink"
              />
            </label>
          )}
          <div>
            <Button variant="dark" onClick={exportIcs} disabled={!plan}>
              <Download aria-hidden="true" className="size-4" />
              {t.settings.exportIcs}
            </Button>
          </div>
          {exported !== null && (
            <Notice variant="success" role="status">
              {format(t.settings.exported, { count: exported })}
            </Notice>
          )}
        </Card>

        <Card id="planner-notify" icon={<BellRing aria-hidden="true" className="size-5 text-blue" />} title={t.settings.notifyTitle}>
          <p>{t.settings.notifyBody}</p>
          {currentPermission === "unsupported" ? (
            <p className="font-semibold text-navy">{t.settings.notifyUnsupported}</p>
          ) : currentPermission === "denied" ? (
            <p className="font-semibold text-navy">{t.settings.notifyDenied}</p>
          ) : settings?.notifications && currentPermission === "granted" ? (
            <>
              <p className="font-semibold text-[#0f5a3c]" role="status">
                {t.settings.notifyOn}
              </p>
              <div>
                <Button variant="outline" onClick={() => settings && onSettings({ ...settings, notifications: false })}>
                  {t.settings.notifyDisable}
                </Button>
              </div>
            </>
          ) : (
            <div>
              <Button variant="dark" onClick={() => void enableNotifications()} disabled={!settings}>
                {t.settings.notifyEnable}
              </Button>
            </div>
          )}
        </Card>

        {/* Not inside the installed Rancho app (its scope includes the planner). */}
        {!standalone && (
          <Card id="planner-app" icon={<Smartphone aria-hidden="true" className="size-5 text-blue" />} title={t.settings.appTitle}>
            <p>{t.settings.appBody}</p>
            <div>
              <ButtonLink href={ranchoAppHref} variant="dark">
                {t.settings.appLink}
              </ButtonLink>
            </div>
          </Card>
        )}

        <Card id="planner-sync" icon={<CloudCheck aria-hidden="true" className="size-5 text-blue" />} title={t.settings.syncTitle}>
          <p className="font-semibold text-navy" role="status">
            {syncText}
          </p>
          {snapshot.importOffer && (
            <div className="grid gap-2 rounded-control border border-[#f2dfa0] bg-gold-soft p-3 text-[#5c4a12]">
              <p>{t.settings.importPrompt}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="dark" onClick={onImport}>
                  {t.settings.importButton}
                </Button>
                <Button size="sm" variant="outline" onClick={onDeclineImport}>
                  {t.settings.importSkip}
                </Button>
              </div>
            </div>
          )}
          <p className="text-xs">{t.settings.privacy}</p>
        </Card>
      </div>

      <section aria-labelledby="planner-reset" className="rounded-card border border-[#f5c2bd] bg-white p-5">
        <h3 id="planner-reset" className="flex items-center gap-2 font-extrabold text-navy">
          <Trash2 aria-hidden="true" className="size-5 text-danger" />
          {t.settings.resetTitle}
        </h3>
        <div className="mt-3">
          <Button
            variant="outline"
            className="border-[#f5c2bd] text-danger hover:border-danger"
            onClick={() => {
              if (window.confirm(t.settings.resetConfirm)) onReset();
            }}
          >
            {snapshot.mode === "guest" ? t.settings.resetGuest : t.settings.resetAccount}
          </Button>
        </div>
      </section>
    </div>
  );
}
