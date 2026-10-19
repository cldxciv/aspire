import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui";
import type { HostelRoomType } from "@/lib/types";

/** Room options as cards (name, tagline, description, features). No prices are shown. */
export function RoomTypes({ rooms }: { rooms: HostelRoomType[] }) {
  if (rooms.length === 0) return null;
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {rooms.map((room) => (
        <li key={room.name} className="flex flex-col rounded-card border border-line bg-white p-5 shadow-soft">
          <h3 className="text-lg font-bold leading-snug text-navy">{room.name}</h3>
          {room.tagline && (
            <p className="mt-1">
              <Badge variant="neutral">{room.tagline}</Badge>
            </p>
          )}
          <p className="mt-2 text-sm text-ink">{room.description}</p>
          {room.features.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm text-ink">
              {room.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
