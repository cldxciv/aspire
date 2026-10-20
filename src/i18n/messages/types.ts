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
};

export type Namespace = keyof Catalog;

/** The messages of one namespace, e.g. `Messages<"common">["nav"]` for a client component's prop type. */
export type Messages<N extends Namespace> = Catalog[N];
