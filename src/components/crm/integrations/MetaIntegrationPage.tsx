import Link from "next/link";
import { Notice } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import type { MetaInboxItem, MetaIntegrationView } from "@/lib/crm/meta/types";
import type { CrmMessages } from "../format";
import type { Option } from "../types";
import { ConnectionActions } from "./ConnectionActions";
import { ConnectionStatus } from "./ConnectionStatus";
import { CredentialsForm } from "./CredentialsForm";
import { FailedLeadsList } from "./FailedLeadsList";
import { FieldMappingEditor } from "./FieldMappingEditor";
import { FormsTable } from "./FormsTable";
import { IMPORT_PATH } from "./model";
import { SetupChecklist } from "./SetupChecklist";
import { TestLeadsPanel } from "./TestLeadsPanel";

/**
 * Integrations → Meta Lead Ads (LR-META; docs/lead-routing-plan.md Part 2, §18, §20). Admins and
 * area heads see the connection status and the checklist; super admins (`view.admin` present) also
 * get the actions, the write-only credentials, the forms and field mapping, test leads and the
 * list of lead ids that need attention. Secrets are never on the page. Server-safe; the forms are
 * client islands that call the API (which re-checks the super admin on every call).
 */
export function MetaIntegrationPage({
  view,
  inbox,
  locale,
  programs,
  centres,
  t,
}: {
  view: MetaIntegrationView;
  /** Super admins only. */
  inbox: readonly MetaInboxItem[] | null;
  locale: Locale;
  programs: readonly Option[];
  centres: readonly Option[];
  t: Pick<CrmMessages, "metaAds" | "errors">;
}) {
  const m = t.metaAds;
  const errors = t.errors;
  const admin = view.admin;
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink">{m.direct}</p>
      {!admin && (
        <Notice variant="info" role="note">
          {m.statusOnly}
        </Notice>
      )}
      {admin?.key.weak ? (
        <Notice variant="error" role="alert">
          {m.keyWeak}
        </Notice>
      ) : (
        !view.readiness.keyConfigured && (
          <Notice variant="error" role="alert">
            {m.keyMissing}
          </Notice>
        )
      )}
      {!view.readiness.ready && (
        <p className="text-sm text-muted">
          {m.csvFallback}{" "}
          <Link href={localePath(IMPORT_PATH, locale)} className="font-bold text-blue underline-offset-2 hover:underline focus-visible:underline">
            {m.csvLink}
          </Link>
        </p>
      )}
      <ConnectionStatus view={view} locale={locale} m={m} actions={admin ? <ConnectionActions needsReseal={admin.needsReseal} m={m} errors={errors} /> : undefined} />
      {admin && (
        <>
          <CredentialsForm
            config={admin.config}
            secrets={admin.secrets}
            verifyToken={admin.verifyToken}
            callbackUrl={view.callbackUrl}
            keyConfigured={view.readiness.keyConfigured}
            m={m}
            errors={errors}
          />
          <FormsTable forms={admin.config.value.forms} version={admin.config.version} programs={programs} centres={centres} m={m} errors={errors} />
          <FieldMappingEditor fieldMap={admin.config.value.fieldMap} version={admin.config.version} m={m} errors={errors} />
          <TestLeadsPanel
            active={view.testMode.active}
            until={view.testMode.until}
            phone={admin.config.value.testPhone}
            m={m}
            errors={errors}
          />
          <FailedLeadsList items={inbox ?? []} locale={locale} m={m} />
        </>
      )}
      <SetupChecklist view={view} m={m} />
    </div>
  );
}
