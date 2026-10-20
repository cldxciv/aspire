import type { Messages } from "@/i18n/messages/types";

/**
 * Site-wide configuration. Contact fields stay `null` until Aspire verifies
 * them (see docs/content-verification.md) — UI must hide null fields rather
 * than show placeholder numbers or addresses.
 */
export const siteConfig = {
  name: "Aspire IIT & Medical",
  shortName: "Aspire",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://aspireiit.in",
  description:
    "IIT JEE, NEET, Foundation and integrated school programs for students across Himachal Pradesh.",
  tagline: "Transforming aspirations into achievements",
  region: "Himachal Pradesh",
  contact: {
    phone: null as string | null,
    email: null as string | null,
    address: null as string | null,
    hours: null as string | null,
  },
} as const;

/** Label keys: `common.nav.items` / `common.nav.descriptions` in src/i18n/messages/<locale>/common.ts. */
export type NavLabelKey = keyof Messages<"common">["nav"]["items"];
export type NavDescriptionKey = keyof Messages<"common">["nav"]["descriptions"];

/**
 * A navigation entry. `href` is the locale-free path; render it through `localePath(href, locale)`
 * and the label through the current locale's `common` messages (D-028).
 */
export type NavItem = {
  labelKey: NavLabelKey;
  href: string;
  /** Optional dropdown links (rendered as an accessible disclosure, not role=menu). */
  children?: { labelKey: NavLabelKey; href: string; descriptionKey?: NavDescriptionKey }[];
};

/** Main navigation per the approved homepage design (D-022). Order matters. */
export const mainNav: NavItem[] = [
  { labelKey: "home", href: "/" },
  {
    labelKey: "programs",
    href: "/programs",
    children: [
      { labelKey: "allPrograms", href: "/programs", descriptionKey: "allPrograms" },
      { labelKey: "admissions", href: "/admissions", descriptionKey: "admissions" },
    ],
  },
  { labelKey: "results", href: "/results" },
  { labelKey: "centres", href: "/centres" },
  { labelKey: "hostels", href: "/hostels" },
  { labelKey: "about", href: "/about" },
  {
    labelKey: "resources",
    href: "/resources",
    children: [
      { labelKey: "allResources", href: "/resources" },
      { labelKey: "articles", href: "/resources#articles" },
      { labelKey: "downloads", href: "/resources#downloads" },
      { labelKey: "admissionsFaqs", href: "/admissions#faqs" },
    ],
  },
  { labelKey: "contact", href: "/contact" },
];

export const portalNav: NavItem[] = [
  { labelKey: "studentLogin", href: "/login?role=student" },
  { labelKey: "parentLogin", href: "/login?role=parent" },
];
