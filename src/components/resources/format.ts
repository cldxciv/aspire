import type { ArticleCategory } from "@/lib/types";

export const ARTICLE_CATEGORY_LABELS: Record<ArticleCategory, string> = {
  "study-guidance": "Study guidance",
  "exam-updates": "Exam updates",
  news: "News",
  admissions: "Admissions",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Formats an ISO date ("2026-10-18") as "18 Oct 2026" without constructing a Date,
 * so output is deterministic (no timezone shift) and safe during prerendering.
 */
export function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : iso;
}
