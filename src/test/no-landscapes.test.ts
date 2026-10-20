import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * D-031 (docs/m5-plan.md): nature / landscape imagery is used only by the homepage hero. Every
 * other slot shows result cards (general sections) or a non-nature education photo. This scans the
 * source of each public page directory for the landscape stock keys, their files, the Aspire
 * landscape assets and the MountainRidge decoration.
 *
 * Allowed: the home hero (HomeHero.tsx and its MountainRidge decoration) and the registries in
 * src/content/ (images.ts, aspire-assets.ts, Hindi alt overlays). Tests are not scanned.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const LANDSCAPE = [
  // Stock keys (src/content/images.ts) …
  "himalayaHero",
  "himalayaBlueRidge",
  "mountainTrail",
  "shimlaPanorama",
  "dhauladharTriund",
  "kulluValley",
  "hamirpurHills",
  "hillRoadBarot",
  // … their files …
  "himalaya-dhauladhar-ridge-hero",
  "himalaya-blue-ridge",
  "mountain-ridge-trail-snow-peaks",
  "shimla-hill-town-panorama",
  "dhauladhar-peaks-triund-dharamshala",
  "kullu-valley-solang-snow-range",
  "hamirpur-hills-dhauladhar-morning",
  "winding-hill-road-barot",
  // … Aspire landscape assets (src/content/aspire-assets.ts) and the hero's ridge decoration.
  "heroMountains",
  "hero-mountains",
  "himachalLandscape",
  "himachal-landscape",
  "bgMountainDark",
  "bgMountainLight",
  "bg-mountain",
  "MountainRidge",
];

const ALLOWED = new Set(["src/components/home/HomeHero.tsx", "src/components/home/MountainRidge.tsx"]);

/** Public page directories (RES-A: home, programs, results, centres; RES-B: the rest). All enforced. */
const PAGE_DIRS = [
  "src/app/[lang]/(site)/page.tsx",
  "src/app/[lang]/(site)/programs",
  "src/app/[lang]/(site)/results",
  "src/app/[lang]/(site)/centres",
  "src/components/home",
  "src/components/programs",
  "src/components/results",
  "src/components/centres",
  "src/app/[lang]/(site)/about",
  "src/app/[lang]/(site)/admissions",
  "src/app/[lang]/(site)/contact",
  "src/app/[lang]/(site)/hostels",
  "src/app/[lang]/(site)/resources",
  "src/app/[lang]/(site)/privacy",
  "src/app/[lang]/(site)/terms",
  "src/components/about",
  "src/components/admissions",
  "src/components/contact",
  "src/components/hostels",
  "src/components/resources",
  "src/components/legal",
  "src/components/faq",
  "src/components/portal/StudentViews.tsx",
  "src/components/portal/ParentViews.tsx",
];

/** Non-test .ts / .tsx files under `rel` (a file or a directory); [] when it does not exist. */
function sourceFiles(rel: string): string[] {
  const abs = path.join(ROOT, rel);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    return [];
  }
  if (stat.isFile()) return [rel];
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [child] : [];
  });
}

/** "file: term" for every landscape reference in the files under `rel`, except the allowed files. */
function landscapeRefs(rel: string): string[] {
  return sourceFiles(rel)
    .filter((file) => !ALLOWED.has(file))
    .flatMap((file) => {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      return LANDSCAPE.filter((term) => text.includes(term)).map((term) => `${file}: ${term}`);
    });
}

describe("D-031: landscapes only in the homepage hero", () => {
  it("the home hero keeps its mountains (owner choice)", () => {
    const hero = readFileSync(path.join(ROOT, "src/components/home/HomeHero.tsx"), "utf8");
    expect(hero).toContain("himalayaHero");
  });

  it.each(PAGE_DIRS)("%s uses no landscape image", (dir) => {
    // A renamed or moved directory must fail here rather than pass silently with nothing scanned.
    expect(sourceFiles(dir).length, `${dir} has source files`).toBeGreaterThan(0);
    expect(landscapeRefs(dir)).toEqual([]);
  });

  it("nothing else in src/ references a landscape (registries in src/content/ excepted)", () => {
    const refs = landscapeRefs("src").filter((ref) => !ref.startsWith("src/content/"));
    expect(refs).toEqual([]);
  });
});
