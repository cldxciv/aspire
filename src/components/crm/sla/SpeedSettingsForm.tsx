"use client";

import { useState, type FormEvent } from "react";
import { PortalPanel } from "@/components/portal/PortalBlocks";
import { Button } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { CallingHours, SettingEnvelope, SpeedRule } from "@/lib/crm/lead-ops-types";
import { ActionFeedback, useCrmAction } from "../client-kit";
import type { CrmMessages } from "../format";
import { CallingHoursEditor } from "./CallingHoursEditor";
import { callingHoursIssues, speedRuleIssues, speedSaveRequest, type SpeedMessages } from "./model";
import { SpeedRuleSettings } from "./SpeedRuleSettings";

export type SpeedFormMessages = {
  speed: Pick<SpeedMessages, "form" | "hours" | "rule">;
  sources: CrmMessages["sources"];
  outcomes: CrmMessages["lead"]["contact"]["outcomes"];
  errors: CrmMessages["errors"];
};

interface SavedSettings {
  callingHours: SettingEnvelope<CallingHours>;
  speedRule: SettingEnvelope<SpeedRule>;
  recomputed?: number;
}

/**
 * "Calling hours & speed" (owner: LR-SLA; docs/lead-routing-plan.md §15, §20). Super admins edit
 * and save (PUT /api/crm/settings/speed, with the versions the page loaded: 409 when someone saved
 * meanwhile); area heads and admins see the same values read-only. The browser checks the values
 * first; the server re-validates everything and enforces "super admin only".
 */
export function SpeedSettingsForm({
  initial,
  canEdit,
  pagePath,
  locale,
  t,
}: {
  initial: { callingHours: SettingEnvelope<CallingHours>; speedRule: SettingEnvelope<SpeedRule> };
  canEdit: boolean;
  pagePath: string;
  locale: Locale;
  t: SpeedFormMessages;
}) {
  const f = t.speed.form;
  const action = useCrmAction(t, pagePath, { refresh: false });
  const [hours, setHours] = useState<CallingHours>(initial.callingHours.value);
  const [rule, setRule] = useState<SpeedRule>(initial.speedRule.value);
  const [saved, setSaved] = useState({
    callingHours: initial.callingHours.value,
    speedRule: initial.speedRule.value,
    versions: { callingHours: initial.callingHours.version, speedRule: initial.speedRule.version },
  });
  const [showIssues, setShowIssues] = useState(false);
  const [note, setNote] = useState("");

  const hourIssues = callingHoursIssues(hours, t.speed.hours);
  const ruleIssues = speedRuleIssues(rule, t.speed.rule);
  const invalid = Object.keys(hourIssues).length > 0 || Object.keys(ruleIssues).length > 0;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNote("");
    if (invalid) {
      setShowIssues(true);
      action.setError(f.invalid);
      return;
    }
    const request = speedSaveRequest({ callingHours: hours, speedRule: rule }, saved);
    if (!request) {
      action.reset();
      setNote(f.nothing);
      return;
    }
    const result = await action.run<SavedSettings>(request, undefined, (failure) => (failure.status === 409 ? f.conflict : failure.error === "validation" ? f.invalid : null));
    if (!result) return;
    setSaved({
      callingHours: result.callingHours.value,
      speedRule: result.speedRule.value,
      versions: { callingHours: result.callingHours.version, speedRule: result.speedRule.version },
    });
    setHours(result.callingHours.value);
    setRule(result.speedRule.value);
    setShowIssues(false);
    setNote(result.recomputed ? format(f.savedRecomputed, { count: result.recomputed }) : f.saved);
  }

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      <PortalPanel id="crm-speed-hours" title={t.speed.hours.title} description={t.speed.hours.intro}>
        <CallingHoursEditor value={hours} onChange={setHours} disabled={!canEdit} issues={canEdit && showIssues ? hourIssues : {}} locale={locale} t={t.speed.hours} />
      </PortalPanel>
      <PortalPanel id="crm-speed-rule" title={t.speed.rule.title} description={t.speed.rule.intro}>
        <SpeedRuleSettings
          value={rule}
          onChange={setRule}
          disabled={!canEdit}
          issues={canEdit && showIssues ? ruleIssues : {}}
          t={{ rule: t.speed.rule, sources: t.sources, outcomes: t.outcomes }}
        />
      </PortalPanel>
      {canEdit && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-card border border-line bg-white p-4 shadow-soft">
          <Button type="submit" disabled={action.pending}>
            {action.pending ? f.saving : f.save}
          </Button>
          <ActionFeedback status={note} error={action.error} />
        </div>
      )}
    </form>
  );
}
