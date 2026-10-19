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

export type NavItem = { label: string; href: string };

export const mainNav: NavItem[] = [
  { label: "Programs", href: "/programs" },
  { label: "About", href: "/about" },
  { label: "Results", href: "/results" },
  { label: "Faculty", href: "/faculty" },
  { label: "Centres", href: "/centres" },
  { label: "Admissions", href: "/admissions" },
  { label: "Resources", href: "/resources" },
  { label: "Contact", href: "/contact" },
];

export const portalNav: NavItem[] = [
  { label: "Student Login", href: "/login?role=student" },
  { label: "Parent Login", href: "/login?role=parent" },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "Explore",
    items: [
      { label: "Programs", href: "/programs" },
      { label: "Results archive", href: "/results" },
      { label: "Our story", href: "/about" },
      { label: "Faculty", href: "/faculty" },
      { label: "Centre directory", href: "/centres" },
      { label: "Hostels", href: "/hostels" },
    ],
  },
  {
    title: "Students & parents",
    items: [
      { label: "Admissions", href: "/admissions" },
      { label: "Resources", href: "/resources" },
      { label: "Student portal", href: "/student" },
      { label: "Parent portal", href: "/parent" },
    ],
  },
  {
    title: "Connect",
    items: [
      { label: "Contact us", href: "/contact" },
      { label: "Book counselling", href: "/admissions#enquiry" },
      { label: "Privacy notice", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];
