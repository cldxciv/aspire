"use client";

import type { RefObject } from "react";

import type { Locale } from "@/i18n/config";

import { RanchoChat, type RanchoGateMessages, type RanchoLinks, type RanchoPanelMessages } from "./RanchoChat";
import type { RanchoHandoff } from "./rancho-handoff";

export type { RanchoGateMessages, RanchoLinks, RanchoPanelMessages } from "./RanchoChat";

/**
 * The floating launcher's chat (lazy-loaded by RanchoLauncher on first open): `RanchoChat` as a
 * native `<dialog>` — a full-height sheet on phones, a popover above the launcher from 640px. See
 * RanchoChat for the layout, voice, tool cards, handoffs and the lead gate (the homepage Ask tab
 * and the tools' "Ask Rancho …" buttons open this panel, so they share its contact form).
 */
export function RanchoChatPanel(props: {
  id: string;
  open: boolean;
  onClose: () => void;
  /** Gets focus back when the panel closes (the launcher button). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  messages: RanchoPanelMessages;
  /** Namespace `leadGate` (the contact form before Rancho's first answer on this browser). */
  gateMessages: RanchoGateMessages;
  locale: Locale;
  links: RanchoLinks;
  /** The latest "Ask Rancho about this" handoff from a tool on this page. */
  handoff?: RanchoHandoff | null;
}) {
  return <RanchoChat variant="panel" {...props} />;
}
