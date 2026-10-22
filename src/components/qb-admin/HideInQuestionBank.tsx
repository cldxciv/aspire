"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { stripLocale } from "@/i18n/paths";
import { isQuestionBankPath } from "@/components/portal/areas";

/**
 * Renders `children` except on question-bank pages (`/admin/questions/**`). The portal shell uses
 * it for the data-free preview banner of a staff session in the admin area: staff get real
 * question-bank pages there (§B6), but the other admin pages are still a preview for them.
 */
export function HideInQuestionBank({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname && isQuestionBankPath(stripLocale(pathname))) return null;
  return <>{children}</>;
}
