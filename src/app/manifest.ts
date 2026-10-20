import type { MetadataRoute } from "next";

/**
 * Web app manifest (owner: PWA; auto-linked on every page). The installable app is RANCHO: Aspire's
 * AI doubt solver with the student tools (predictor, mock tests, planner) and sign-in, starting at
 * /rancho. Installing from any page — including the planner — gives this one app.
 *
 * One manifest serves both languages: the start page is English and a shortcut opens the Hindi
 * app home. Icons are drawn by /api/rancho/icon (src/components/pwa/rancho-icon.ts). The planner's
 * offline service worker (public/planner-sw.js) is unchanged and still scoped to the planner pages.
 */

const ICON = "/api/rancho/icon";
const SHORTCUT_ICON = [{ src: `${ICON}?size=192`, sizes: "192x192", type: "image/png" }];

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/rancho",
    name: "Rancho — Aspire IIT & Medical",
    short_name: "Rancho",
    description:
      "Rancho, Aspire's AI doubt solver for JEE, NEET and school science, with the rank predictor, CBT mock tests and study planner. In English and Hindi.",
    start_url: "/rancho",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#0b2d5b",
    lang: "en-IN",
    dir: "ltr",
    categories: ["education", "productivity"],
    icons: [
      { src: `${ICON}?size=192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${ICON}?size=512`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${ICON}?size=512&maskable=1`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ask a doubt", short_name: "Ask", url: "/rancho", icons: SHORTCUT_ICON },
      { name: "Rank predictor", short_name: "Predictor", url: "/tools/predictor", icons: SHORTCUT_ICON },
      { name: "Mock tests", short_name: "Mock tests", url: "/tools/mock-tests", icons: SHORTCUT_ICON },
      { name: "Study planner", short_name: "Planner", url: "/tools/planner", icons: SHORTCUT_ICON },
      { name: "रैंचो (हिंदी)", short_name: "हिंदी", url: "/hi/rancho", icons: SHORTCUT_ICON },
    ],
  };
}
