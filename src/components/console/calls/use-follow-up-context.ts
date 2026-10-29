"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useCrmAction } from "@/components/crm/client-kit";
import type { CrmMessages } from "@/components/crm/format";
import type { FollowUpContextView } from "@/lib/crm/console/followup/types";
import { callsRequests } from "./api";

export type ContextState = { status: "loading" } | { status: "ready"; ctx: FollowUpContextView } | { status: "error"; message: string };

/**
 * Loads `GET /api/crm/leads/[leadId]/outcome` once per mount. Dialog bodies are mounted only while
 * their `CrmDialog` is open, so every opening gets fresh presets and attempts (and a page refresh
 * while the dialog is open never reloads it under the staff member's hands). Failures are localised
 * by `useCrmAction` (401 → the sign-in page). Never refreshes the page.
 */
export function useFollowUpContext(leadId: string, taskId: string | null, t: Pick<CrmMessages, "errors">, pagePath: string): ContextState {
  const loader = useCrmAction(t, pagePath, { refresh: false });
  const [state, setState] = useState<ContextState>({ status: "loading" });
  const load = useEffectEvent(() => loader.run<FollowUpContextView>(callsRequests.outcomeContext(leadId, taskId)));
  useEffect(() => {
    let live = true;
    void load().then((data) => {
      if (live) setState(data ? { status: "ready", ctx: data } : { status: "error", message: "" });
    });
    return () => {
      live = false;
    };
  }, []);
  return state.status === "error" ? { status: "error", message: loader.error ?? "" } : state;
}
