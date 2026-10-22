"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { useLocale } from "@/i18n/client";
import { format } from "@/i18n/format";
import type { ApiFailure } from "@/lib/auth/client-api";
import type { MetaConfig, MetaSecretName, MetaSecretState, SettingEnvelope } from "@/lib/crm/lead-ops-types";
import { META_SILENCE_HOURS_MAX, type MetaActionResult, type MetaTypedSecret } from "@/lib/crm/meta/types";
import { ActionFeedback, fieldClasses, labelClasses, useCrmAction } from "../client-kit";
import { leadOpsRequests } from "../lead-ops-api";
import { cleanMetaId, INTEGRATIONS_PATH, secretStateText, type MetaIslandMessages } from "./model";

/**
 * The super admin's connection form (docs/lead-routing-plan.md §7 steps 2–5, §18.7):
 * 1. App ID, Page ID, the on / off switch, the Graph version and the silence warning (not secret);
 * 2. the App Secret and the access token: WRITE-ONLY fields (never filled back, `type=password`,
 *    no autocomplete), each save or removal confirmed with the current password;
 * 3. what to paste into Meta: the Callback URL and the verify token (super admins only), with copy.
 * The server re-checks the super admin and the password on every call.
 */
export function CredentialsForm({
  config,
  secrets,
  verifyToken,
  callbackUrl,
  keyConfigured,
  m,
  errors,
}: MetaIslandMessages & {
  config: SettingEnvelope<MetaConfig>;
  secrets: Record<MetaSecretName, MetaSecretState>;
  verifyToken: string | null;
  callbackUrl: string;
  keyConfigured: boolean;
}) {
  return (
    <section aria-labelledby="meta-credentials-heading" className="space-y-6 rounded-card border border-line bg-white p-5 shadow-soft">
      <h2 id="meta-credentials-heading" className="text-lg font-extrabold text-navy">
        {m.credentials.heading}
      </h2>
      <IdsForm config={config} m={m} errors={errors} />
      <SecretsForm secrets={secrets} keyConfigured={keyConfigured} m={m} errors={errors} />
      <PasteIntoMeta callbackUrl={callbackUrl} verifyToken={verifyToken} keyConfigured={keyConfigured} m={m} errors={errors} />
    </section>
  );
}

function IdsForm({ config, m, errors }: MetaIslandMessages & { config: SettingEnvelope<MetaConfig> }) {
  const c = m.credentials;
  const id = useId();
  const action = useCrmAction({ errors }, INTEGRATIONS_PATH);
  const value = config.value;
  const [appId, setAppId] = useState(value.appId ?? "");
  const [pageId, setPageId] = useState(value.pageId ?? "");
  const [enabled, setEnabled] = useState(value.enabled);
  const [graphVersion, setGraphVersion] = useState(value.graphVersion);
  const [silence, setSilence] = useState(String(value.silenceAlertHours));
  const [issues, setIssues] = useState<Record<string, string>>({});
  // A newer saved version replaces the fields (after this form's own save they already match).
  const [baseVersion, setBaseVersion] = useState(config.version);
  if (baseVersion !== config.version) {
    setBaseVersion(config.version);
    setAppId(value.appId ?? "");
    setPageId(value.pageId ?? "");
    setEnabled(value.enabled);
    setGraphVersion(value.graphVersion);
    setSilence(String(value.silenceAlertHours));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const app = cleanMetaId(appId);
    const page = cleanMetaId(pageId);
    const hours = Number(silence);
    if (app === null) next.appId = c.appIdHint;
    if (page === null) next.pageId = c.pageIdHint;
    if (!/^v\d{2}\.0$/.test(graphVersion.trim())) next.graphVersion = format(c.graphVersionHint, { version: value.graphVersion });
    if (!Number.isInteger(hours) || hours < 0 || hours > META_SILENCE_HOURS_MAX) next.silence = c.silenceHoursHint;
    setIssues(next);
    if (Object.keys(next).length > 0) return;
    await action.run(
      leadOpsRequests.saveMetaConfig(
        { appId: app === "" ? null : app, pageId: page === "" ? null : page, enabled, graphVersion: graphVersion.trim(), silenceAlertHours: hours },
        config.version,
      ),
      c.saved,
    );
  }

  const field = (key: string, label: string, hint: string, input: ReactNode) => (
    <div className="space-y-1">
      <label htmlFor={`${id}-${key}`} className={labelClasses}>
        {label}
      </label>
      {input}
      <p id={`${id}-${key}-hint`} className={issues[key] ? "text-sm font-semibold text-danger" : "text-sm text-muted"}>
        {issues[key] ?? hint}
      </p>
    </div>
  );
  const describedBy = (key: string) => `${id}-${key}-hint`;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      <p className="text-sm text-muted">{c.lead}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {field(
          "appId",
          c.appId,
          c.appIdHint,
          <input id={`${id}-appId`} inputMode="numeric" autoComplete="off" value={appId} onChange={(event) => setAppId(event.target.value)} aria-invalid={issues.appId ? true : undefined} aria-describedby={describedBy("appId")} className={fieldClasses} />,
        )}
        {field(
          "pageId",
          c.pageId,
          c.pageIdHint,
          <input id={`${id}-pageId`} inputMode="numeric" autoComplete="off" value={pageId} onChange={(event) => setPageId(event.target.value)} aria-invalid={issues.pageId ? true : undefined} aria-describedby={describedBy("pageId")} className={fieldClasses} />,
        )}
        {field(
          "graphVersion",
          c.graphVersion,
          format(c.graphVersionHint, { version: value.graphVersion }),
          <input id={`${id}-graphVersion`} autoComplete="off" spellCheck={false} value={graphVersion} onChange={(event) => setGraphVersion(event.target.value)} aria-invalid={issues.graphVersion ? true : undefined} aria-describedby={describedBy("graphVersion")} className={fieldClasses} />,
        )}
        {field(
          "silence",
          c.silenceHours,
          c.silenceHoursHint,
          <input id={`${id}-silence`} type="number" min={0} max={META_SILENCE_HOURS_MAX} step={1} value={silence} onChange={(event) => setSilence(event.target.value)} aria-invalid={issues.silence ? true : undefined} aria-describedby={describedBy("silence")} className={fieldClasses} />,
        )}
      </div>
      <div className="flex items-start gap-3">
        <input id={`${id}-enabled`} type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} aria-describedby={`${id}-enabled-hint`} className="mt-1 size-5 accent-[#0b5cad]" />
        <div>
          <label htmlFor={`${id}-enabled`} className={labelClasses}>
            {c.enabled}
          </label>
          <p id={`${id}-enabled-hint`} className="text-sm text-muted">
            {c.enabledHint}
          </p>
        </div>
      </div>
      <Button type="submit" variant="dark" disabled={action.pending} aria-busy={action.pending || undefined}>
        {c.save}
      </Button>
      <ActionFeedback status={action.status} error={action.error} />
    </form>
  );
}

const SECRET_LABELS = { app_secret: "appSecret", access_token: "accessToken" } as const;

function SecretsForm({ secrets, keyConfigured, m, errors }: MetaIslandMessages & { secrets: Record<MetaSecretName, MetaSecretState>; keyConfigured: boolean }) {
  const c = m.credentials;
  const id = useId();
  const locale = useLocale();
  const action = useCrmAction({ errors }, INTEGRATIONS_PATH);
  const [values, setValues] = useState<Record<MetaTypedSecret, string>>({ app_secret: "", access_token: "" });
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState<MetaSecretName | null>(null);
  const label = (name: MetaTypedSecret) => c[SECRET_LABELS[name]];

  const onFailure = (result: ApiFailure) => {
    if (Object.hasOwn(result.fieldErrors, "currentPassword")) return c.wrongPassword;
    if (Object.hasOwn(result.fieldErrors, "value")) return c.invalidValue;
    return null;
  };

  async function save(name: MetaTypedSecret) {
    if (!values[name].trim()) return action.setError(c.needValue);
    if (!password) return action.setError(c.needPassword);
    const done = await action.run(leadOpsRequests.setMetaSecret(name, values[name].trim(), password), format(c.secretSaved, { name: label(name) }), onFailure);
    if (done) {
      setValues((current) => ({ ...current, [name]: "" }));
      setPassword("");
    }
  }

  async function remove(name: MetaSecretName) {
    if (!password) return action.setError(c.needPassword);
    const title = name === "page_token" ? c.pageToken : name === "verify_token" ? c.verifyToken : label(name);
    const done = await action.run(leadOpsRequests.deleteMetaSecret(name, password), format(c.removed, { name: title }), onFailure);
    setConfirming(null);
    if (done) setPassword("");
  }

  return (
    <fieldset className="space-y-4 border-t border-line pt-5" disabled={!keyConfigured}>
      <legend className="text-base font-extrabold text-navy">{c.secretsHeading}</legend>
      <p className="text-sm text-muted">{c.secretsLead}</p>
      {(["app_secret", "access_token"] as const).map((name) => (
        <div key={name} className="space-y-1">
          <label htmlFor={`${id}-${name}`} className={labelClasses}>
            {label(name)}
          </label>
          <p id={`${id}-${name}-state`} className="text-sm text-ink">
            {secretStateText(secrets[name], m, locale)}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`${id}-${name}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={c.valuePlaceholder}
              value={values[name]}
              onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
              aria-describedby={`${id}-${name}-state ${id}-${name}-hint`}
              className={fieldClasses}
            />
            <Button variant="dark" disabled={action.pending} onClick={() => void save(name)} className="shrink-0">
              {format(c.saveSecret, { name: label(name) })}
            </Button>
          </div>
          <p id={`${id}-${name}-hint`} className="text-sm text-muted">
            {name === "app_secret" ? c.appSecretHint : c.accessTokenHint}
          </p>
          {secrets[name].set && (
            <RemoveRow
              title={label(name)}
              confirming={confirming === name}
              pending={action.pending}
              onAsk={() => setConfirming(name)}
              onCancel={() => setConfirming(null)}
              onConfirm={() => void remove(name)}
              m={m}
            />
          )}
        </div>
      ))}
      <div className="space-y-1">
        <p className={labelClasses}>{c.pageToken}</p>
        <p className="text-sm text-ink">
          {secretStateText(secrets.page_token, m, locale)} · <span className="text-muted">{c.pageTokenHint}</span>
        </p>
      </div>
      <div className="max-w-sm space-y-1">
        <label htmlFor={`${id}-password`} className={labelClasses}>
          {c.currentPassword}
        </label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby={`${id}-password-hint`}
          className={fieldClasses}
        />
        <p id={`${id}-password-hint`} className="text-sm text-muted">
          {c.currentPasswordHint}
        </p>
      </div>
      <ActionFeedback status={action.status} error={action.error} />
    </fieldset>
  );
}

function RemoveRow({
  title,
  confirming,
  pending,
  onAsk,
  onCancel,
  onConfirm,
  m,
}: {
  title: string;
  confirming: boolean;
  pending: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  m: MetaIslandMessages["m"];
}) {
  const c = m.credentials;
  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={onAsk}>
        {format(c.remove, { name: title })}
      </Button>
    );
  }
  return (
    <div role="group" aria-label={format(c.remove, { name: title })} className="flex flex-wrap items-center gap-2 rounded-control border border-[#f5c2bd] bg-danger-soft p-2 text-sm text-danger">
      <span>{format(c.removeConfirm, { name: title })}</span>
      <Button variant="outline" size="sm" disabled={pending} onClick={onConfirm}>
        {format(c.remove, { name: title })}
      </Button>
      <Button variant="outline" size="sm" onClick={onCancel}>
        {c.cancel}
      </Button>
    </div>
  );
}

/** What the super admin pastes into Meta's webhook form (§6, §7 step 3). */
function PasteIntoMeta({ callbackUrl, verifyToken, keyConfigured, m, errors }: MetaIslandMessages & { callbackUrl: string; verifyToken: string | null; keyConfigured: boolean }) {
  const c = m.credentials;
  const id = useId();
  const action = useCrmAction({ errors }, INTEGRATIONS_PATH);
  const [shown, setShown] = useState(false);
  const [copyNote, setCopyNote] = useState("");

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote(c.copied);
    } catch {
      setCopyNote(c.copyFailed);
    }
  }

  async function regenerate() {
    const result = await action.run<MetaActionResult>(leadOpsRequests.metaAction({ action: "regenerate_verify_token" }), c.verifyTokenMade);
    if (result) setShown(true);
  }

  return (
    <div className="space-y-4 border-t border-line pt-5">
      <h3 className="text-base font-extrabold text-navy">{c.webhookHeading}</h3>
      <div className="space-y-1">
        <label htmlFor={`${id}-callback`} className={labelClasses}>
          {c.callbackUrl}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id={`${id}-callback`} readOnly value={callbackUrl} className={`${fieldClasses} font-mono text-sm`} onFocus={(event) => event.currentTarget.select()} />
          <Button variant="outline" onClick={() => void copy(callbackUrl)} className="shrink-0">
            {c.copy}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {verifyToken ? (
          <label htmlFor={`${id}-verify`} className={labelClasses}>
            {c.verifyToken}
          </label>
        ) : (
          <p className={labelClasses}>{c.verifyToken}</p>
        )}
        {verifyToken ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`${id}-verify`}
              readOnly
              type={shown ? "text" : "password"}
              autoComplete="off"
              value={verifyToken}
              className={`${fieldClasses} font-mono text-sm`}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button variant="outline" onClick={() => setShown((value) => !value)} className="shrink-0">
              {shown ? c.hide : c.show}
            </Button>
            <Button variant="outline" onClick={() => void copy(verifyToken)} className="shrink-0">
              {c.copy}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink">{c.verifyTokenMissing}</p>
        )}
        <Button variant="outline" size="sm" disabled={!keyConfigured || action.pending} onClick={() => void regenerate()}>
          {verifyToken ? c.newVerifyToken : c.makeVerifyToken}
        </Button>
      </div>
      <p role="status" className="text-sm font-semibold text-success">
        {copyNote}
      </p>
      <ActionFeedback status={action.status} error={action.error} />
    </div>
  );
}
