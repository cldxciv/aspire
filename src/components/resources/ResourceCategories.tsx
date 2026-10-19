import { BookOpen, CircleQuestionMark, Download, PencilLine, type LucideIcon } from "lucide-react";
import { Badge, ButtonLink, Card, type CardTint } from "@/components/ui";

type Category = {
  icon: LucideIcon;
  title: string;
  description: string;
  tint: CardTint;
  note?: string;
  action: { label: string; href: string; variant: "dark" | "outline" };
};

/** Resource category cards (mockup `page-resources`). Copy describes what exists today — nothing more. */
export function ResourceCategories({ articleCount, downloadCount = 0 }: { articleCount: number; downloadCount?: number }) {
  const categories: Category[] = [
    {
      icon: BookOpen,
      title: "Study guidance",
      description: "Study plans, revision guidance and exam preparation articles.",
      tint: "blue",
      note: articleCount > 0 ? `${articleCount} article${articleCount === 1 ? "" : "s"} below` : "Coming soon",
      action:
        articleCount > 0
          ? { label: "Read articles", href: "#articles", variant: "outline" }
          : { label: "Ask a study question", href: "/contact", variant: "outline" },
    },
    {
      icon: PencilLine,
      title: "Practice and tests",
      description: "Online practice and tests will be linked here if Aspire connects its test platform.",
      tint: "gold",
      action: { label: "Student portal", href: "/login?role=student", variant: "dark" },
    },
    downloadCount > 0
      ? {
          icon: Download,
          title: "Prospectus and downloads",
          description: "Planners, past papers and the prospectus. Files will be added once Aspire approves them.",
          tint: "green",
          note: "Available soon",
          action: { label: "See downloads", href: "#downloads", variant: "outline" },
        }
      : {
          icon: Download,
          title: "Prospectus",
          description: "A current prospectus will be available here once Aspire approves it.",
          tint: "green",
          action: { label: "Request information", href: "/admissions#enquiry", variant: "outline" },
        },
    {
      icon: CircleQuestionMark,
      title: "Frequently asked questions",
      description: "Admissions, programs, scholarships and centre information.",
      tint: "violet",
      action: { label: "Read admissions FAQs", href: "/admissions#faqs", variant: "outline" },
    },
  ];

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {categories.map(({ icon: Icon, title, description, tint, note, action }) => (
        <li key={title}>
          <Card tint={tint} className="flex h-full flex-col p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-blue-soft text-blue">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <h3 className="mt-3 text-lg font-extrabold text-navy">{title}</h3>
            <p className="mt-1 flex-1 text-sm text-muted">{description}</p>
            {note && (
              <Badge variant="neutral" className="mt-3 self-start">
                {note}
              </Badge>
            )}
            <ButtonLink href={action.href} variant={action.variant} className="mt-4 self-start">
              {action.label}
            </ButtonLink>
          </Card>
        </li>
      ))}
    </ul>
  );
}
