"use client";

import { Info } from "lucide-react";
import { useEffect } from "react";

import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";

import { leadGateStore, type LeadGateStore } from "./lead-gate-store";
import { useLeadGateState } from "./use-lead-gate";

/**
 * <LeadGateNote>: the up-front disclosure ("we ask once for a contact number before results"),
 * shown BEFORE a tool is used (no bait-and-switch, plan §6 / TG-3): beside the predictor's
 * submit, on the mock-test start screen, in the Rancho composer, under the planner form.
 *
 * Rendered from the live GET /api/lead-gate mode, never from build-time env (critiques 0.5 / 1.4):
 * nothing while unknown or when the gate is off / already satisfied (signed in, details shared).
 */
export function LeadGateNote({
  messages: t,
  className,
  store = leadGateStore,
}: {
  messages: Messages<"leadGate">;
  className?: string;
  store?: LeadGateStore;
}) {
  const gate = useLeadGateState(store);
  useEffect(() => {
    void store.ensure();
  }, [store]);

  const satisfied = gate.via === "session" || gate.via === "pass" || gate.via === "off";
  const text = satisfied ? null : gate.mode === "required" ? t.note.required : gate.mode === "optional" ? t.note.optional : null;
  if (!text) return null;
  return (
    <p className={cn("flex items-start gap-2 rounded-lg bg-blue-soft p-3 text-[13px] leading-snug text-navy", className)}>
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </p>
  );
}
