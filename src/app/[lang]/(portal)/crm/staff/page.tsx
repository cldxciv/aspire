import type { Metadata } from "next";
import { Suspense } from "react";
import { CrmGate, crmCentres, programOptions, type CrmAccess } from "@/components/crm/CrmGate";
import type { CrmMessages } from "@/components/crm/format";
import { StaffPageBody } from "@/components/crm/StaffPageBody";
import type { Locale } from "@/i18n/config";
import { getLocale, getMessages } from "@/i18n/server";
import { getAssignmentRules, listStaff } from "@/lib/crm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("crm");
  return { title: t.staff.metaTitle, description: t.staff.metaDescription };
}

/** Staff & assignment rules: admins edit, centre managers read, counsellors don't get the page. */
export default async function CrmStaffPage() {
  const [locale, t] = await Promise.all([getLocale(), getMessages("crm")]);
  return (
    <CrmGate path="/crm/staff" title={t.staff.title}>
      {(access) => (
        <Suspense fallback={<p className="text-sm text-muted">{t.common.loading}</p>}>
          <Staff access={access} locale={locale} t={t} />
        </Suspense>
      )}
    </CrmGate>
  );
}

async function Staff({ access, locale, t }: { access: CrmAccess; locale: Locale; t: CrmMessages }) {
  const { viewer, permissions } = access;
  const staff = permissions.canViewStaff ? listStaff(viewer) : null;
  const rules = permissions.canViewStaff ? getAssignmentRules(viewer) : null;
  const centres = await crmCentres(locale);
  return (
    <StaffPageBody
      permissions={permissions}
      staff={staff?.ok ? staff.data : []}
      rules={rules?.ok ? rules.data : []}
      centres={centres.options}
      programs={programOptions(t)}
      locale={locale}
      t={t}
    />
  );
}
