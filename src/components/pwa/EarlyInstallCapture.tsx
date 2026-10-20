"use client";

import { useSyncExternalStore } from "react";

import { EARLY_INSTALL_CAPTURE_SCRIPT } from "./install-platform";

const noopSubscribe = () => () => {};

/**
 * Catches the browser's install prompt while the page's HTML is still being parsed (see
 * EARLY_INSTALL_CAPTURE_SCRIPT), so ./install-store never misses it. Mounted first in the public
 * (site) layout.
 *
 * The inline `<script>` only matters in the server-rendered HTML. It is kept while hydrating (the
 * server snapshot) and dropped on the client afterwards, so a client-side navigation into the public
 * site never creates a `<script>` element (React warns about those, and would not run one anyway).
 */
export function EarlyInstallCapture() {
  const inServerHtml = useSyncExternalStore(
    noopSubscribe,
    () => false,
    () => true,
  );
  if (!inServerHtml) return null;
  return <script dangerouslySetInnerHTML={{ __html: EARLY_INSTALL_CAPTURE_SCRIPT }} />;
}
