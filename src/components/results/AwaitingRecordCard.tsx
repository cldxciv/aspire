import { Badge } from "@/components/ui";
import type { Messages } from "@/i18n/messages/types";

/**
 * Honest stand-in shown while no verified result records are published
 * (mockup "awaiting approved record" cards). Describes what will appear;
 * contains no names, ranks or counts. Copy: `results.awaiting` messages.
 */
export type AwaitingCategory = {
  tag: string;
  title: string;
  description: string;
  status: string;
};

/** Results archive stand-ins (four categories), in display order, from the `results` messages. */
export function archiveAwaiting(t: Messages<"results">["awaiting"]): AwaitingCategory[] {
  return [t.jee, t.neet, t.foundation, t.archive];
}

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
