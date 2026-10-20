import { X } from "lucide-react";
import type { Ref } from "react";

import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";

export type RanchoPhotoMessages = Messages<"rancho">["panel"]["photo"];

/**
 * The photo attached in the Rancho chat composer: a thumbnail of the local preview (an object URL;
 * nothing has been uploaded yet), a remove button, the "no faces or names" confirmation the API
 * requires with a photo, and the privacy note (location removed on the device, not stored).
 * Presentational and hook-free; the panel owns the state.
 */
export function RanchoPhotoAttachment({
  previewUrl,
  consent,
  onConsentChange,
  onRemove,
  consentError,
  ids,
  consentRef,
  messages: t,
}: {
  previewUrl: string;
  consent: boolean;
  onConsentChange: (checked: boolean) => void;
  onRemove: () => void;
  /** Shown under the checkbox when the student tries to send without ticking it. */
  consentError: string | null;
  ids: { consent: string; consentError: string; note: string };
  consentRef?: Ref<HTMLInputElement>;
  messages: RanchoPhotoMessages;
}) {
  return (
    <div data-rancho-photo="" className="mt-2 rounded-control border border-line bg-page p-2">
      <div className="flex items-start gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, never uploaded anywhere */}
        <img
          src={previewUrl}
          alt={t.previewAlt}
          className="size-16 shrink-0 rounded-md border border-line bg-white object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold leading-5 text-navy">{t.attached}</p>
          <label htmlFor={ids.consent} className="mt-0.5 flex cursor-pointer items-start gap-2 text-xs leading-5 text-ink">
            <input
              ref={consentRef}
              id={ids.consent}
              type="checkbox"
              checked={consent}
              onChange={(event) => onConsentChange(event.target.checked)}
              aria-invalid={consentError ? true : undefined}
              aria-describedby={cn(consentError && ids.consentError, ids.note)}
              className="mt-0.5 size-4 shrink-0 accent-navy"
            />
            <span>{t.consent}</span>
          </label>
        </div>
        <button
          type="button"
          onClick={onRemove}
          title={t.remove}
          className="-m-1 grid size-11 shrink-0 place-items-center rounded-control text-[#315475] transition-colors hover:bg-white hover:text-danger"
        >
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">{t.remove}</span>
        </button>
      </div>
      {consentError && (
        <p id={ids.consentError} className="mt-1 text-xs font-semibold text-danger">
          {consentError}
        </p>
      )}
      <p id={ids.note} className="mt-1.5 text-[11px] leading-4 text-[#315475]">
        {t.note}
      </p>
    </div>
  );
}
