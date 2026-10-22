import { LOGIN_ID_RULES } from "./identifiers";

/** User-facing messages for the auth and admin APIs (English; the UI may localise by error code). */
export const AUTH_MESSAGES = {
  /** The only sign-in failure message: unknown id, wrong password, disabled and wrong-tab all look the same. */
  loginFailed: "Incorrect login ID or password.",
  rateLimited: (retryAfterSeconds: number) => {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return `Too many attempts. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
  },
  wrongCurrentPassword: "Your current password is incorrect.",
  samePassword: "Choose a new password that is different from your current one.",
  loginIdTaken: "This login ID is already in use.",
  invalidLoginId: `Use ${LOGIN_ID_RULES}`,
  invalidDisplayName: "Enter a display name of up to 100 characters.",
  invalidRoleFilter: "role must be student, parent, admin or staff.",
  invalidUserId: "Invalid user id.",
  userNotFound: "No such user.",
  selfDisable: "You cannot disable your own account.",
  lastAdmin: "At least one active admin account must remain.",
  selfReset: "Use “Change password” to change your own password.",
  notAParent: "Links can only be made from a parent account.",
  notAStudent: "Links can only be made to a student account.",
  // Super admin (D-044; docs/lead-routing-plan.md §11).
  superAdminOnly: "Only a super admin can do this.",
  staffSuperAdminOnly: "Only a super admin can create or change staff (CRM) accounts.",
  superAdminTarget: "Only a super admin can change a super admin's account.",
  lastSuperAdmin: "At least one super admin must remain.",
  notAdmin: "Only an enabled admin account can be made a super admin.",
} as const;

/** Portal areas with no connected data source (D-029: no LMS / student-information system yet). */
export const NOT_CONNECTED_AREAS = ["timetable", "results", "attendance"] as const;
