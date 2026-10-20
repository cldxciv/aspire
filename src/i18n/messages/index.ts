import "server-only";
import type { Locale } from "../config";
import enAbout from "./en/about";
import enAdmissions from "./en/admissions";
import enAuth from "./en/auth";
import enCentres from "./en/centres";
import enCommon from "./en/common";
import enContact from "./en/contact";
import enForms from "./en/forms";
import enHome from "./en/home";
import enHostels from "./en/hostels";
import enLegal from "./en/legal";
import enPortal from "./en/portal";
import enPrograms from "./en/programs";
import enResources from "./en/resources";
import enResults from "./en/results";
import enTools from "./en/tools";
import enPredictor from "./en/predictor";
import enMocktest from "./en/mocktest";
import enAsk from "./en/ask";
import enPlanner from "./en/planner";
import enMcp from "./en/mcp";
import enCrm from "./en/crm";
import hiAbout from "./hi/about";
import hiAdmissions from "./hi/admissions";
import hiAuth from "./hi/auth";
import hiCentres from "./hi/centres";
import hiCommon from "./hi/common";
import hiContact from "./hi/contact";
import hiForms from "./hi/forms";
import hiHome from "./hi/home";
import hiHostels from "./hi/hostels";
import hiLegal from "./hi/legal";
import hiPortal from "./hi/portal";
import hiPrograms from "./hi/programs";
import hiResources from "./hi/resources";
import hiResults from "./hi/results";
import hiTools from "./hi/tools";
import hiPredictor from "./hi/predictor";
import hiMocktest from "./hi/mocktest";
import hiAsk from "./hi/ask";
import hiPlanner from "./hi/planner";
import hiMcp from "./hi/mcp";
import hiCrm from "./hi/crm";
import type { Catalog, Messages, Namespace } from "./types";

export type { Catalog, Messages, Namespace } from "./types";

/**
 * Every catalog, keyed by locale. Server-only (`server-only` import above): Client Components
 * receive the messages they need as props (see src/i18n/README.md); for types, import from
 * `@/i18n/messages/types`.
 */
const catalogs: Readonly<Record<Locale, Catalog>> = {
  en: {
    common: enCommon,
    home: enHome,
    programs: enPrograms,
    results: enResults,
    centres: enCentres,
    forms: enForms,
    about: enAbout,
    hostels: enHostels,
    admissions: enAdmissions,
    contact: enContact,
    resources: enResources,
    legal: enLegal,
    portal: enPortal,
    auth: enAuth,
    tools: enTools,
    predictor: enPredictor,
    mocktest: enMocktest,
    ask: enAsk,
    planner: enPlanner,
    mcp: enMcp,
    crm: enCrm,
  },
  hi: {
    common: hiCommon,
    home: hiHome,
    programs: hiPrograms,
    results: hiResults,
    centres: hiCentres,
    forms: hiForms,
    about: hiAbout,
    hostels: hiHostels,
    admissions: hiAdmissions,
    contact: hiContact,
    resources: hiResources,
    legal: hiLegal,
    portal: hiPortal,
    auth: hiAuth,
    tools: hiTools,
    predictor: hiPredictor,
    mocktest: hiMocktest,
    ask: hiAsk,
    planner: hiPlanner,
    mcp: hiMcp,
    crm: hiCrm,
  },
};

/**
 * Messages for an explicit locale. Use `getMessages(namespace)` from `@/i18n/server` in
 * Server Components (it reads the locale from the route); use this in tests, sitemap-like
 * code outside `[lang]`, or when the locale is already known.
 */
export function messagesFor<N extends Namespace>(locale: Locale, namespace: N): Messages<N> {
  return catalogs[locale][namespace];
}
