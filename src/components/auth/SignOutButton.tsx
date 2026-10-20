"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import type { Messages } from "@/i18n/messages/types";
import { callApi } from "@/lib/auth/client-api";
import { cn } from "@/lib/cn";
import { clearToolStorage } from "@/lib/mocktest/shared-device";

/**
 * Signs out with `POST /api/auth/logout` (same-origin, idempotent), then does a full page
 * load of `redirectTo` (a localised path, e.g. `/hi/login`) so no signed-in UI stays in the
 * client router cache. Once signed out it also clears the student tools' data from this browser
 * (mock tests, study planner — QA-SEC-M6 L9) so a shared device does not keep the student's work.
 */
export function SignOutButton({
  messages,
  redirectTo,
  tone = "light",
  compact = false,
  className,
}: {
  messages: Messages<"auth">["signOut"];
  redirectTo: string;
  /** "dark": on the navy portal header; "light": on white cards. */
  tone?: "light" | "dark";
  /** Icon-only below `sm` (the label stays available to screen readers). */
  compact?: boolean;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    const result = await callApi<{ signedOut: boolean }>("/api/auth/logout", { method: "POST" });
    if (result.ok || result.error === "unauthenticated") {
      clearToolStorage();
      window.location.assign(redirectTo);
      return;
    }
    setPending(false);
    setFailed(true);
  }

  const label = pending ? messages.pending : messages.label;
  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        aria-busy={pending || undefined}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-3 text-sm font-bold transition disabled:opacity-70",
          tone === "dark"
            ? "border-white/35 text-white hover:bg-white/10"
            : "border-[#b9cbe0] bg-white text-navy hover:border-blue",
        )}
      >
        <LogOut aria-hidden="true" className="size-4 shrink-0" />
        <span className={cn(compact && "sr-only sm:not-sr-only")}>{label}</span>
      </button>
      {failed && (
        <span role="alert" className={cn("text-xs font-semibold", tone === "dark" ? "text-gold" : "text-danger")}>
          {messages.failed}
        </span>
      )}
    </span>
  );
}
