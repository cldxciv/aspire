import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import type { AssignmentRule, CrmPermissions, CrmStaffMember } from "@/lib/crm/types";
import { CrmPageHeader, NotAllowed } from "./CrmBlocks";
import type { CrmMessages } from "./format";
import { StaffManager, type StaffMessages } from "./StaffManager";
import type { Option } from "./types";

/**
 * `/crm/staff` by role: admins edit, centre managers read (badge + read-only copy), counsellors
 * get a "not available" panel and no data. The page loads `staff` / `rules` only when allowed.
 */
export function StaffPageBody({
  permissions,
  staff,
  rules,
  centres,
  programs,
  locale,
  t,
}: {
  permissions: CrmPermissions;
  staff: CrmStaffMember[];
  rules: AssignmentRule[];
  centres: Option[];
  programs: Option[];
  locale: Locale;
  t: CrmMessages;
}) {
  const canEdit = permissions.canManageStaff && permissions.canEditRules;
  const messages: StaffMessages = { common: t.common, errors: t.errors, roles: t.roles, staff: t.staff };
  return (
    <>
      <CrmPageHeader
        eyebrow={t.area.label}
        title={t.staff.title}
        description={permissions.canViewStaff ? (canEdit ? t.staff.lead : t.staff.managerLead) : undefined}
        badge={permissions.canViewStaff && !canEdit ? t.common.readOnly : undefined}
      />
      {permissions.canViewStaff ? (
        <StaffManager staff={staff} rules={rules} canManage={canEdit} centres={centres} programs={programs} t={messages} />
      ) : (
        <NotAllowed title={t.common.notAllowedTitle} body={t.common.notAllowedBody} homeHref={localePath("/crm", locale)} homeLabel={t.common.goToInbox} />
      )}
    </>
  );
}
