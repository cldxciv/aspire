/**
 * Message catalog types (type-only; safe to import anywhere, including Client Components).
 * The English files define each namespace's shape; Hindi files are typed `Messages<"<ns>">`,
 * so a missing or extra Hindi key is a type error.
 *
 * All namespaces are pre-registered here and in ./index.ts, so Phase B agents only edit
 * their own `en/<ns>.ts` + `hi/<ns>.ts` files.
 */
import type about from "./en/about";
import type admissions from "./en/admissions";
import type auth from "./en/auth";
import type centres from "./en/centres";
import type common from "./en/common";
import type contact from "./en/contact";
import type forms from "./en/forms";
import type home from "./en/home";
import type hostels from "./en/hostels";
import type legal from "./en/legal";
import type portal from "./en/portal";
import type programs from "./en/programs";
import type resources from "./en/resources";
import type results from "./en/results";
import type tools from "./en/tools";
import type predictor from "./en/predictor";
import type mocktest from "./en/mocktest";
import type ask from "./en/ask";
import type planner from "./en/planner";
import type mcp from "./en/mcp";
import type crm from "./en/crm";
import type rancho from "./en/rancho";
import type ranchoApp from "./en/ranchoApp";
import type leadGate from "./en/leadGate";
import type qb from "./en/qb";
import type qbImport from "./en/qbImport";
import type layout from "./en/layout";
import type consoleCommon from "./en/console-common";
import type consoleCalls from "./en/console-calls";
import type consoleSources from "./en/console-sources";
import type consoleNumbers from "./en/console-numbers";
import type consoleFamily from "./en/console-family";
import type consolePeople from "./en/console-people";

export type Catalog = {
  common: typeof common;
  home: typeof home;
  programs: typeof programs;
  results: typeof results;
  centres: typeof centres;
  forms: typeof forms;
  about: typeof about;
  hostels: typeof hostels;
  admissions: typeof admissions;
  contact: typeof contact;
  resources: typeof resources;
  legal: typeof legal;
  portal: typeof portal;
  auth: typeof auth;
  tools: typeof tools;
  predictor: typeof predictor;
  mocktest: typeof mocktest;
  ask: typeof ask;
  planner: typeof planner;
  mcp: typeof mcp;
  crm: typeof crm;
  rancho: typeof rancho;
  ranchoApp: typeof ranchoApp;
  leadGate: typeof leadGate;
  qb: typeof qb;
  qbImport: typeof qbImport;
  layout: typeof layout;
  /** Admin console Phase 1b catalogs (docs/admin-phase-1b-plan.md §12); components import them directly too. */
  "console-common": typeof consoleCommon;
  "console-calls": typeof consoleCalls;
  "console-sources": typeof consoleSources;
  "console-numbers": typeof consoleNumbers;
  "console-family": typeof consoleFamily;
  "console-people": typeof consolePeople;
};

export type Namespace = keyof Catalog;

/** The messages of one namespace, e.g. `Messages<"common">["nav"]` for a client component's prop type. */
export type Messages<N extends Namespace> = Catalog[N];
