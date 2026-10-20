"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { captureVisitAttribution } from "./enquiry-context";

/**
 * Records the visit's landing attribution (utm_* tags of the link the visitor arrived by, the
 * external referrer host, a tool CTA's `?from=`) in sessionStorage on every page view, so an
 * enquiry sent later in the visit carries it (D-039). Renders nothing and sends nothing; the data
 * only leaves the browser inside an enquiry the visitor submits with consent.
 *
 * Mount once in the public site layout: `<AttributionCapture />`. The enquiry forms also capture
 * when they mount, so landings on the home page or /admissions work without it.
 */
export function AttributionCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureVisitAttribution();
  }, [pathname]);
  return null;
}
