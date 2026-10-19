import { Badge } from "@/components/ui";

/**
 * Honest stand-in shown while no verified result records are published
 * (mockup "awaiting approved record" cards). Describes what will appear;
 * contains no names, ranks or counts.
 */
export type AwaitingCategory = {
  tag: string;
  title: string;
  description: string;
  status: string;
};

/** Home page results feature (three cards). */
export const HOME_AWAITING: AwaitingCategory[] = [
  {
    tag: "JEE · Result story",
    title: "Student achievement",
    description: "Student name, exam year, rank and destination will be published only after verification.",
    status: "Awaiting approved result record",
  },
  {
    tag: "NEET · Result story",
    title: "Student achievement",
    description: "A student's preparation journey and verified outcome, shared with consent.",
    status: "Awaiting approved result record",
  },
  {
    tag: "Foundation",
    title: "Academic progress",
    description: "Approved stories about growth, confidence and learning.",
    status: "Awaiting approved story",
  },
];

/** Results archive (four categories). */
export const ARCHIVE_AWAITING: AwaitingCategory[] = [
  {
    tag: "JEE",
    title: "Verified result archive",
    description: "Exam, year and outcome from Aspire's official records, with the student's name only where consent is given.",
    status: "No verified result published yet",
  },
  {
    tag: "NEET",
    title: "Verified result archive",
    description: "Approved result details and student stories, published with consent.",
    status: "No verified result published yet",
  },
  {
    tag: "Foundation",
    title: "Student progress stories",
    description: "Approved academic milestones that do not imply unverified exam outcomes.",
    status: "No approved story published yet",
  },
  {
    tag: "Archive",
    title: "Historical records",
    description: "Year-wise records will be browsable here once Aspire provides verified data.",
    status: "Awaiting records",
  },
];

export function AwaitingRecordCard({ category }: { category: AwaitingCategory }) {
  return (
    <div className="flex h-full flex-col rounded-[13px] border border-line bg-white p-[18px] text-ink shadow-soft">
      <Badge className="self-start">{category.tag}</Badge>
      <h3 className="mt-3 text-[15px] font-bold text-navy">{category.title}</h3>
      <p className="mt-1 flex-1 text-xs text-muted">{category.description}</p>
      <p className="mt-3 rounded-lg border border-dashed border-[#cbd8e7] bg-[#f8fbff] p-2.5 text-[11px] font-semibold text-[#53657a]">
        {category.status}
      </p>
    </div>
  );
}
