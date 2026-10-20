import { BookOpen, CircleQuestionMark, Download, PencilLine, type LucideIcon } from "lucide-react";
import { Badge, ButtonLink, Card, type CardTint } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";

type Category = {
  icon: LucideIcon;
  title: string;
  description: string;
  tint: CardTint;
  note?: string;
  action: { label: string; href: string; variant: "dark" | "outline" };
};

/** Resource category cards (mockup `page-resources`). Copy describes what exists today — nothing more. */
export function ResourceCategories({
  articleCount,
  downloadCount = 0,
  messages: m,
  locale,
  columns = 4,
}: {
  articleCount: number;
  downloadCount?: number;
  messages: Messages<"resources">["categories"];
  locale: Locale;
  /** 4 across on large screens, or 2 (e.g. beside a photo). */
  columns?: 2 | 4;
}) {
  const categories: Category[] = [
    {
      icon: BookOpen,
      title: m.study.title,
      description: m.study.description,
      tint: "blue",
      note:
        articleCount > 0
          ? format(articleCount === 1 ? m.study.countOne : m.study.countMany, { count: articleCount })
          : m.study.comingSoon,
      action:
        articleCount > 0
          ? { label: m.study.read, href: "#articles", variant: "outline" }
          : { label: m.study.ask, href: "/contact", variant: "outline" },
    },
    {
      icon: PencilLine,
      title: m.practice.title,
      description: m.practice.description,
      tint: "gold",
      action: { label: m.practice.action, href: "/login?role=student", variant: "dark" },
    },
    downloadCount > 0
      ? {
          icon: Download,
          title: m.downloads.title,
          description: m.downloads.description,
          tint: "green",
          note: m.downloads.note,
          action: { label: m.downloads.action, href: "#downloads", variant: "outline" },
        }
      : {
          icon: Download,
          title: m.prospectus.title,
          description: m.prospectus.description,
          tint: "green",
          action: { label: m.prospectus.action, href: "/admissions#enquiry", variant: "outline" },
        },
    {
      icon: CircleQuestionMark,
      title: m.faqs.title,
      description: m.faqs.description,
      tint: "violet",
      action: { label: m.faqs.action, href: "/admissions#faqs", variant: "outline" },
    },
  ];

  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", columns === 4 && "lg:grid-cols-4")}>
      {categories.map(({ icon: Icon, title, description, tint, note, action }) => (
        <li key={title}>
          <Card tint={tint} className="flex h-full flex-col p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-blue-soft text-blue">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <h3 className="mt-3 text-lg font-extrabold leading-snug text-navy">{title}</h3>
            <p className="mt-1 flex-1 text-sm text-muted">{description}</p>
            {note && (
              <Badge variant="neutral" className="mt-3 self-start">
                {note}
              </Badge>
            )}
            <ButtonLink href={localePath(action.href, locale)} variant={action.variant} className="mt-4 self-start">
              {action.label}
            </ButtonLink>
          </Card>
        </li>
      ))}
    </ul>
  );
}
