import { z } from "zod";
import { ROLES } from "./roles";

/**
 * Request bodies for /api/auth/** and /api/admin/users/**. Shapes and size bounds only:
 * password policy, login-id rules and display-name rules are enforced by the account
 * service so every entry point applies the same checks. No server-only imports, so a
 * client form may reuse these for early feedback.
 */

const role = z.enum(ROLES, { error: "Choose student, parent, admin or staff." });

export const loginBodySchema = z.object({
  loginId: z.string({ error: "Enter your login ID." }).trim().min(1, { error: "Enter your login ID." }).max(200),
  password: z.string({ error: "Enter your password." }).min(1, { error: "Enter your password." }).max(1024),
  /** The login page's tab. A mismatch is refused with the generic sign-in error. */
  role: role.optional(),
  /** Post-login destination; ignored unless it is a page in the user's own portal. */
  next: z.string().max(512).optional(),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const changePasswordBodySchema = z.object({
  currentPassword: z
    .string({ error: "Enter your current password." })
    .min(1, { error: "Enter your current password." })
    .max(1024),
  newPassword: z.string({ error: "Enter a new password." }).min(1, { error: "Enter a new password." }).max(1024),
});
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

export const createUserBodySchema = z.object({
  role,
  displayName: z.string({ error: "Enter a display name." }).trim().min(1, { error: "Enter a display name." }).max(200),
  loginId: z.string({ error: "Enter a login ID." }).trim().min(1, { error: "Enter a login ID." }).max(200),
});
export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const updateUserBodySchema = z
  .object({
    disabled: z.boolean({ error: "disabled must be true or false." }).optional(),
    displayName: z.string({ error: "Enter a display name." }).trim().min(1, { error: "Enter a display name." }).max(200).optional(),
  })
  .refine((body) => body.disabled !== undefined || body.displayName !== undefined, {
    error: "Nothing to change: send disabled and/or displayName.",
  });
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
