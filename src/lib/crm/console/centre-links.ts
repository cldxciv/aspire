import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "@/lib/db/connection";

import { fail, ok } from "../access";
import type { SettingEnvelope } from "../lead-ops-types";
import { cleanSlug } from "../pure";
import { readSetting, writeSetting } from "../settings";
import type { CrmResult } from "../types";
import { CONSOLE_AUDIT, consoleAudit } from "./audit";
import { CONSOLE_URL_MAX, type CentreLinksSetting } from "./types";

/**
 * Each centre's Google Maps link (`crm_settings` key `centre_links`; docs/admin-phase-1b-plan.md
 * §3, §5.J; owner: 1B-CORE, editor UI 1B-SOURCES). Super admins write (the route checks with
 * `requireCrmSuperAdmin`); admins and managers read. Optimistic `expectedVersion` like every LR setting.
 */

export const DEFAULT_CENTRE_LINKS: CentreLinksSetting = { centres: {} };
/** At most this many centres in the document. */
export const MAX_LINKED_CENTRES = 60;

const MAPS_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.page", "maps.google.com"]);
const GOOGLE_HOSTS = new Set(["www.google.com", "google.com"]);

export const CENTRE_LINK_MESSAGES = {
  invalidUrl: "Paste the centre's Google Maps link (https://maps.app.goo.gl/… or https://www.google.com/maps/…).",
  tooManyCentres: `At most ${MAX_LINKED_CENTRES} centres.`,
  invalidCentre: "Use centre slugs such as shimla.",
  versionConflict: "Someone else changed these links. Reload the page and try again.",
  validation: "Please check the highlighted fields.",
} as const;

/** An https URL of at most `max` characters (no credentials), normalised by `URL`; else null. */
export function validateHttpsUrl(raw: unknown, max: number = CONSOLE_URL_MAX): URL | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > max) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * A Google Maps link (https, ≤ 300 characters): host `maps.app.goo.gl`, `goo.gl`, `g.page`,
 * `maps.google.com`, or `www.google.com` / `google.com` with a path starting `/maps`. Else null.
 */
export function validateMapsUrl(raw: unknown): string | null {
  const url = validateHttpsUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (url.port) return null;
  if (MAPS_HOSTS.has(host)) return url.toString();
  if (GOOGLE_HOSTS.has(host) && (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))) return url.toString();
  return null;
}

type Validated<T> = { ok: true; value: T } | { ok: false; fieldErrors: Record<string, string[]> };

/** Validates a whole document `{ centres: { <slug>: { mapsUrl } } }` (`mapsUrl: null` = no link). */
export function validateCentreLinks(input: unknown): Validated<CentreLinksSetting> {
  const centres = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as { centres?: unknown }).centres : undefined;
  if (typeof centres !== "object" || centres === null || Array.isArray(centres)) {
    return { ok: false, fieldErrors: { centres: [CENTRE_LINK_MESSAGES.validation] } };
  }
  const entries = Object.entries(centres as Record<string, unknown>);
  if (entries.length > MAX_LINKED_CENTRES) return { ok: false, fieldErrors: { centres: [CENTRE_LINK_MESSAGES.tooManyCentres] } };
  const fieldErrors: Record<string, string[]> = {};
  const value: CentreLinksSetting = { centres: {} };
  for (const [slug, entry] of entries) {
    const clean = cleanSlug(slug);
    if (!clean || clean !== slug) {
      fieldErrors.centres = [CENTRE_LINK_MESSAGES.invalidCentre];
      continue;
    }
    const raw = typeof entry === "object" && entry !== null ? (entry as { mapsUrl?: unknown }).mapsUrl : undefined;
    if (raw === null || raw === undefined || raw === "") {
      value.centres[clean] = { mapsUrl: null };
      continue;
    }
    const url = validateMapsUrl(raw);
    if (!url) fieldErrors[`centres.${clean}.mapsUrl`] = [CENTRE_LINK_MESSAGES.invalidUrl];
    else value.centres[clean] = { mapsUrl: url };
  }
  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, value };
}

/** Stored document → value, or null when unreadable (the default is shown). */
export function parseCentreLinks(raw: unknown): CentreLinksSetting | null {
  const checked = validateCentreLinks(raw);
  return checked.ok ? checked.value : null;
}

/** The centre links (version 0 and no links until a super admin saves them). Never throws. */
export function getCentreLinks(db: DatabaseSync): SettingEnvelope<CentreLinksSetting> {
  return readSetting(db, "centre_links", parseCentreLinks, DEFAULT_CENTRE_LINKS);
}

/** How many centres' links differ between two documents. */
function changedCentres(before: CentreLinksSetting, after: CentreLinksSetting): number {
  const slugs = new Set([...Object.keys(before.centres), ...Object.keys(after.centres)]);
  let changed = 0;
  for (const slug of slugs) if ((before.centres[slug]?.mapsUrl ?? null) !== (after.centres[slug]?.mapsUrl ?? null)) changed += 1;
  return changed;
}

/**
 * Replaces the centre links in one transaction (joins the caller's; the caller has already checked
 * that the viewer is a super admin). Audited `settings.centre_links_update { centres, version }`
 * (counts only, never a URL); `crm.settings_update` is not written a second time.
 */
export function putCentreLinks(
  db: DatabaseSync,
  input: unknown,
  options: { actorId: string; expectedVersion: number; now: number },
): CrmResult<SettingEnvelope<CentreLinksSetting>> {
  const checked = validateCentreLinks(input);
  if (!checked.ok) return fail("validation", CENTRE_LINK_MESSAGES.validation, checked.fieldErrors);
  const value = checked.value;
  return withTransaction(db, (): CrmResult<SettingEnvelope<CentreLinksSetting>> => {
    const before = getCentreLinks(db).value;
    const written = writeSetting(db, "centre_links", value, { expectedVersion: options.expectedVersion, actorId: options.actorId, now: options.now, audit: false });
    if (!written.ok) return fail("conflict", CENTRE_LINK_MESSAGES.versionConflict);
    consoleAudit(db, {
      actorId: options.actorId,
      action: CONSOLE_AUDIT.centreLinksUpdate,
      target: "centre_links",
      details: { centres: changedCentres(before, value), version: written.envelope.version },
      now: options.now,
    });
    return ok(written.envelope);
  });
}
