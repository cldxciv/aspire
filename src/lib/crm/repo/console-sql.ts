/**
 * Admin console Phase 1b: shared SQL fragments over `crm_leads l` (docs/admin-phase-1b-plan.md
 * §4.2; owner: 1B-CORE). STRINGS ONLY, NO IMPORTS, so repo/leads.ts can import this file without a
 * cycle. Every fragment refers to the lead as `l` and uses its own aliases inside sub-queries.
 */

/**
 * The lead's effective centre: its own centre, else the default centre of its routing area. An
 * area-routed enquiry without a chosen centre counts (and is filtered) under its area's centre.
 */
export const EFFECTIVE_CENTRE_SQL =
  "COALESCE(l.centre_slug, (SELECT ea.default_centre_slug FROM crm_lead_routing er JOIN crm_areas ea ON ea.id = er.area_id WHERE er.lead_id = l.id))";

/**
 * A free-tool sign-up in ANY area (dashboard sub-lines and `signups=hide`): routed as a gate-only
 * arrival, or (older leads without a routing row) a `tool` lead whose consent is a lead-gate sentence.
 * The QUEUE of unrouted tool sign-ups is lead routing's own `area=tool_signups` filter, used as is.
 * Never NULL (a NULL consent version reads as ''), so `NOT TOOL_SIGNUP_SQL` keeps such a lead.
 */
export const TOOL_SIGNUP_SQL =
  "(EXISTS (SELECT 1 FROM crm_lead_routing g WHERE g.lead_id = l.id AND g.gate_only = 1) OR (NOT EXISTS (SELECT 1 FROM crm_lead_routing g2 WHERE g2.lead_id = l.id) AND l.source = 'tool' AND COALESCE(l.consent_text_version, '') LIKE '%.gate.v%'))";

/** Imported families: a CSV import (or Phase 2 paper form), or a lead carrying a CSV batch ref. */
export const IMPORTED_SQL =
  "(l.source IN ('csv_import','paper_form') OR EXISTS (SELECT 1 FROM crm_external_refs x WHERE x.lead_id = l.id AND x.provider = 'csv' AND x.batch_id IS NOT NULL))";

/**
 * Test leads, left out of `P_all` counts: erased as "wrong number, test or junk", or (lead
 * routing's Meta test mode, before the 24-hour erase) every submission / staff entry tagged `test`.
 */
export const TEST_LEAD_SQL =
  "(EXISTS (SELECT 1 FROM crm_activities te WHERE te.lead_id = l.id AND te.type = 'erase' AND json_extract(te.meta, '$.reason') = 'wrong_or_test')" +
  " OR (EXISTS (SELECT 1 FROM crm_activities tm WHERE tm.lead_id = l.id AND tm.type = 'submission' AND json_extract(tm.meta, '$.test') = 1)" +
  " AND NOT EXISTS (SELECT 1 FROM crm_activities tr WHERE tr.lead_id = l.id AND tr.type IN ('submission','created') AND COALESCE(json_extract(tr.meta, '$.test'), 0) <> 1)))";

/** Nobody has logged a call or a WhatsApp for the lead yet (`contact=none`). */
export const NEVER_CONTACTED_SQL = "NOT EXISTS (SELECT 1 FROM crm_activities ca WHERE ca.lead_id = l.id AND ca.type IN ('call','whatsapp'))";

/** When the lead was last moved to Enrolled (epoch ms), or NULL. */
export const ENROLLED_AT_SQL =
  "(SELECT MAX(s.at) FROM crm_activities s WHERE s.lead_id = l.id AND s.type = 'stage_change' AND json_extract(s.meta, '$.to') = 'enrolled')";

/** The kept, non-personal referrer host: join `crm_lead_attribution la` and use this as the referrer. */
export const REFERRER_WITH_ATTRIBUTION_SQL = "COALESCE(l.referrer, la.referrer_host)";
