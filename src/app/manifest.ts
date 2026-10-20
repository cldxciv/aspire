import type { MetadataRoute } from "next";

/**
 * Web app manifest (owner: A4-PLANNER). Installing the site opens the study planner, which works
 * offline through its own service worker (public/planner-sw.js, scoped to the planner pages only).
 * One manifest serves both languages: the start page is English and a shortcut opens the Hindi
 * planner. Icons are drawn by /api/planner/icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/tools/planner",
    name: "Aspire Study Planner",
    short_name: "Aspire Planner",
    description: "A day-by-day study plan to your exam date, with spaced revision, formula flashcards, streaks and XP.",
    start_url: "/tools/planner",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#0b2d5b",
    lang: "en-IN",
    dir: "ltr",
    categories: ["education", "productivity"],
    icons: [
      { src: "/api/planner/icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/planner/icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/planner/icon?size=512&maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "स्टडी प्लानर (हिंदी)",
        short_name: "प्लानर (हिंदी)",
        url: "/hi/tools/planner",
        icons: [{ src: "/api/planner/icon?size=192", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
