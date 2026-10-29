import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";

import { eraseLead } from "../../admin";
import { insertTemplateIfMissing } from "../../repo/console-templates";
import { lead, staff, T0, user, viewerOf } from "../../sla/test-kit";
import { recordOutcome } from "../followup/outcome";
import { SEED_KEYS_1B, TEMPLATE_LANGS, TEMPLATE_SLOTS } from "../types";
import {
  buildSlotValues,
  cleanSlotValue,
  composerIssues,
  fillTemplate,
  firstWord,
  leftoverSlots,
  templateBodyIssues,
  WA_TEXT_MAX,
  waMeHref,
} from "./fill";
import { ensureTemplatesSeeded, SEED_TEMPLATES_1B, seedMissingTemplates } from "./seed";
import { editTemplate, getWaLinks, listTemplates, putWaLinks, setTemplateStatus } from "./templates";

// 1B-CALLS (docs/admin-phase-1b-plan.md §5.D, §4.4): seeding, edits, approval, the prospectus
// link and slot filling, against a fresh in-memory database.

const db = () => getDb();
const count = (sql: string, ...values: (string | number)[]) => Number(db().prepare(sql).get(...values)?.n ?? 0);

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

/** The first admin is the bootstrap super admin (D-044); the second is a plain admin. */
function people() {
  const sa = viewerOf(user("admin", "owner.sa").id, "admin");
  const admin = viewerOf(user("admin", "plain.admin").id, "admin");
  const manager = viewerOf(staff("head.one", "manager").id, "staff");
  const counsellor = viewerOf(staff("exec.one", "counsellor").id, "staff");
  expect(sa.superAdmin).toBe(true);
  expect(admin.superAdmin).not.toBe(true);
  return { sa, admin, manager, counsellor };
}

const versionOf = (key: string) => Number(db().prepare("SELECT version FROM crm_wa_templates WHERE key = ?").get(key)?.version);

describe("seed drafts (§4.4, O5)", () => {
  it("the 8 drafts use only known slots, fit 700 characters, and say nothing about the system sending", () => {
    expect(SEED_TEMPLATES_1B.map((seed) => seed.key)).toEqual([...SEED_KEYS_1B]);
    for (const seed of SEED_TEMPLATES_1B) {
      for (const lang of TEMPLATE_LANGS) {
        const body = seed[lang];
        const { issues, unknown } = templateBodyIssues(body);
        expect(issues.filter((issue) => issue !== "edgeSlot"), `${seed.key} ${lang}`).toEqual([]);
        expect(unknown).toEqual([]);
        expect(body.startsWith("Namaste") || body.startsWith("नमस्ते")).toBe(true);
        expect(body).not.toMatch(/\b(fee|fees|₹|rs\.?)\b/i);
      }
    }
  });

  it("seeds once, even when two first reads both saw the keys missing (INSERT OR IGNORE)", () => {
    // Both "requests" read the table before either wrote.
    expect(seedMissingTemplates(db(), SEED_TEMPLATES_1B, T0)).toBe(8);
    expect(seedMissingTemplates(db(), SEED_TEMPLATES_1B, T0 + 1)).toBe(0);
    expect(ensureTemplatesSeeded(db(), T0 + 2)).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM crm_wa_templates")).toBe(8);
    expect(count("SELECT COUNT(*) AS n FROM crm_wa_templates WHERE status = 'draft' AND context = 'general' AND seeded = 1 AND version = 1")).toBe(8);
    // No audit rows, no activity rows.
    expect(listAudit(db(), { limit: 50 })).toEqual([]);
    expect(count("SELECT COUNT(*) AS n FROM crm_activities")).toBe(0);
  });

  it("per-key seeding adds a missing key and leaves edited rows alone", () => {
    const { sa } = people();
    ensureTemplatesSeeded(db(), T0);
    expect(editTemplate(sa, "first_contact", { lang: "en", body: "Namaste {parent_name} ji, edited.", expectedVersion: 1 }, T0).ok).toBe(true);
    db().prepare("DELETE FROM crm_wa_templates WHERE key = 'after_visit'").run();
    expect(ensureTemplatesSeeded(db(), T0 + 1)).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM crm_wa_templates")).toBe(8);
    expect(db().prepare("SELECT body_en, seeded FROM crm_wa_templates WHERE key = 'first_contact'").get()).toEqual({ body_en: "Namaste {parent_name} ji, edited.", seeded: 0 });
  });
});

describe("reading templates (GET /api/crm/templates)", () => {
  it("everyone gets APPROVED templates of the context only; `all` is for area heads and admins", () => {
    const { sa, admin, manager, counsellor } = people();
    expect(listTemplates(counsellor, { context: "general" }, T0)).toEqual({ ok: true, data: [] }); // drafts are never offered
    expect(setTemplateStatus(sa, "missed_call", { status: "approved", expectedVersion: 1 }, T0).ok).toBe(true);
    // A Phase 2 context, approved: not offered on the lead page.
    insertTemplateIfMissing(db(), { key: "booking_confirm", context: "booking", position: 0, bodyEn: "Namaste {parent_name} ji.", bodyHi: "नमस्ते {parent_name} जी।", bodyHinglish: "Namaste {parent_name} ji.", now: T0 });
    expect(setTemplateStatus(sa, "booking_confirm", { status: "approved", expectedVersion: 1 }, T0).ok).toBe(true);
    const general = listTemplates(counsellor, { context: "general" }, T0);
    expect(general.ok && general.data.map((template) => template.key)).toEqual(["missed_call"]);
    const booking = listTemplates(counsellor, { context: "booking" }, T0);
    expect(booking.ok && booking.data.map((template) => template.key)).toEqual(["booking_confirm"]);
    expect(listTemplates(counsellor, { all: true }, T0)).toMatchObject({ ok: false, error: "forbidden" });
    for (const viewer of [manager, admin, sa]) {
      const all = listTemplates(viewer, { all: true }, T0);
      expect(all.ok && all.data.length).toBe(9);
    }
    const missed = listTemplates(counsellor, {}, T0);
    expect(missed.ok && missed.data[0]).toMatchObject({ key: "missed_call", status: "approved", approvedBy: "Person owner.sa", version: 2, seeded: true });
  });
});

describe("editing and approving (super admins only, §5.D)", () => {
  it("only a super admin edits or changes status; admins, managers and counsellors are refused", () => {
    const { sa, admin, manager, counsellor } = people();
    ensureTemplatesSeeded(db(), T0);
    for (const viewer of [admin, manager, counsellor]) {
      expect(editTemplate(viewer, "missed_call", { lang: "en", body: "Namaste {parent_name} ji.", expectedVersion: 1 }, T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(setTemplateStatus(viewer, "missed_call", { status: "approved", expectedVersion: 1 }, T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(putWaLinks(viewer, { prospectusUrl: "https://example.org/p.pdf", expectedVersion: 0 }, T0)).toMatchObject({ ok: false, error: "forbidden" });
    }
    expect(versionOf("missed_call")).toBe(1);
    expect(setTemplateStatus(sa, "missed_call", { status: "approved", expectedVersion: 1 }, T0).ok).toBe(true);
  });

  it("editing an approved template sends it back to draft; versions guard against lost updates; audits hold no text", () => {
    const { sa } = people();
    ensureTemplatesSeeded(db(), T0);
    expect(setTemplateStatus(sa, "missed_call", { status: "approved", expectedVersion: 1 }, T0)).toMatchObject({ ok: true, data: { status: "approved", version: 2 } });
    const body = "नमस्ते {parent_name} जी, बात नहीं हो पाई। – {counsellor_name}, Aspire";
    const edited = editTemplate(sa, "missed_call", { lang: "hi", body, expectedVersion: 2 }, T0 + 1);
    expect(edited).toMatchObject({ ok: true, data: { status: "draft", version: 3, seeded: false, approvedAt: null, approvedBy: null, bodies: { hi: body } } });
    expect(editTemplate(sa, "missed_call", { lang: "en", body: "Namaste {parent_name} ji.", expectedVersion: 2 }, T0)).toMatchObject({ ok: false, error: "conflict" });
    expect(setTemplateStatus(sa, "missed_call", { status: "retired", expectedVersion: 2 }, T0)).toMatchObject({ ok: false, error: "conflict" });
    expect(setTemplateStatus(sa, "missed_call", { status: "draft", expectedVersion: 3 }, T0)).toMatchObject({ ok: false, error: "validation" });
    expect(setTemplateStatus(sa, "missed_call", { status: "retired", expectedVersion: 3 }, T0)).toMatchObject({ ok: true, data: { status: "retired" } });
    expect(editTemplate(sa, "no_such_key", { lang: "en", body: "Namaste {parent_name} ji.", expectedVersion: 1 }, T0)).toMatchObject({ ok: false, error: "not_found" });
    const audit = listAudit(db(), { limit: 50 }).filter((entry) => entry.action.startsWith("settings.template_"));
    expect(audit.map((entry) => [entry.action, entry.details])).toEqual(
      expect.arrayContaining([
        ["settings.template_status", { key: "missed_call", status: "approved" }],
        ["settings.template_update", { key: "missed_call", lang: "hi", version: 3 }],
        ["settings.template_status", { key: "missed_call", status: "retired" }],
      ]),
    );
    expect(JSON.stringify(audit)).not.toContain("बात नहीं");
  });

  it("refuses unknown slots, a slot at the start or the end, empty and over-long bodies", () => {
    const { sa } = people();
    ensureTemplatesSeeded(db(), T0);
    const edit = (body: string) => editTemplate(sa, "missed_call", { lang: "en", body, expectedVersion: 1 }, T0);
    expect(edit("Namaste {guardian} ji.")).toMatchObject({ ok: false, error: "validation", fieldErrors: { body: ["Use only the slots listed on the page."] } });
    expect(edit("{parent_name} ji, hello.")).toMatchObject({ ok: false, fieldErrors: { body: [expect.stringContaining("Start and end")] } });
    expect(edit("Hello from {centre}")).toMatchObject({ ok: false, fieldErrors: { body: [expect.stringContaining("Start and end")] } });
    expect(edit("   ")).toMatchObject({ ok: false, fieldErrors: { body: ["Write the message."] } });
    expect(edit(`Namaste ${"x".repeat(700)}.`)).toMatchObject({ ok: false, fieldErrors: { body: ["At most 700 characters."] } });
    expect(templateBodyIssues("Hi {Parent Name} and {centre}.")).toEqual({ issues: ["unknownSlot"], unknown: ["Parent Name"] });
    expect(versionOf("missed_call")).toBe(1);
  });
});

describe("prospectus link (`wa_links`, super admins)", () => {
  it("https only, ≤ 300 characters, optimistic version; the audit holds the version, never the URL", () => {
    const { sa } = people();
    expect(getWaLinks(db())).toMatchObject({ value: { prospectusUrl: null }, version: 0, isDefault: true });
    expect(putWaLinks(sa, { prospectusUrl: "http://example.org/p.pdf", expectedVersion: 0 }, T0)).toMatchObject({ ok: false, error: "validation" });
    expect(putWaLinks(sa, { prospectusUrl: `https://example.org/${"p".repeat(300)}`, expectedVersion: 0 }, T0)).toMatchObject({ ok: false, error: "validation" });
    expect(putWaLinks(sa, { prospectusUrl: "https://example.org/prospectus.pdf", expectedVersion: 0 }, T0)).toMatchObject({ ok: true, data: { version: 1, value: { prospectusUrl: "https://example.org/prospectus.pdf" } } });
    expect(putWaLinks(sa, { prospectusUrl: null, expectedVersion: 0 }, T0)).toMatchObject({ ok: false, error: "conflict" });
    expect(putWaLinks(sa, { prospectusUrl: "", expectedVersion: 1 }, T0)).toMatchObject({ ok: true, data: { version: 2, value: { prospectusUrl: null } } });
    const audit = listAudit(db(), { limit: 50 }).filter((entry) => entry.action === "settings.wa_links_update");
    expect(audit.map((entry) => entry.details)).toEqual(expect.arrayContaining([{ version: 1 }, { version: 2 }]));
    expect(JSON.stringify(listAudit(db(), { limit: 50 }))).not.toContain("example.org");
    expect(listAudit(db(), { limit: 50 }).some((entry) => entry.action === "crm.settings_update")).toBe(false);
  });
});

describe("slot filling (§5.D)", () => {
  it("auto-fills parent, student's first name, counsellor, centre in the chosen language, links", () => {
    const values = buildSlotValues({
      guardianName: null,
      contactName: "  Meena\u0007 Devi ",
      studentName: "Riya Sharma",
      counsellorName: "Counsellor {One}",
      centreLabel: "शिमला BCS मुख्य परिसर",
      centreMapLink: "https://maps.app.goo.gl/abc",
      prospectusLink: null,
    });
    expect(values).toEqual({
      parent_name: "Meena Devi",
      student_first_name: "Riya",
      counsellor_name: "Counsellor One",
      centre: "शिमला BCS मुख्य परिसर",
      centre_map_link: "https://maps.app.goo.gl/abc",
    });
    const hi = SEED_TEMPLATES_1B.find((seed) => seed.key === "centre_location")?.hi ?? "";
    const filled = fillTemplate(hi, values);
    expect(filled).toContain("हमारा शिमला BCS मुख्य परिसर सेंटर");
    expect(filled).toContain("https://maps.app.goo.gl/abc");
    expect(leftoverSlots(filled)).toEqual([]);
    // The guardian wins over the contact-form name; values are ≤ 120 characters.
    expect(buildSlotValues({ guardianName: "Anil", contactName: "Meena" }).parent_name).toBe("Anil");
    expect(cleanSlotValue("y".repeat(200))).toHaveLength(120);
    expect(firstWord("  ")).toBeNull();
  });

  it("never cuts a link: 250-character Maps and prospectus links are filled whole; a longer or unsafe link stays a slot", () => {
    const padTo = (base: string, length: number) => base + "a".repeat(length - base.length);
    const maps = padTo("https://www.google.com/maps/place/Aspire+Shimla/@31.1048,77.1734,17z/data=!3m1!4b1!4m6!3m5!1s0x", 250);
    const prospectus = padTo("https://example.org/aspire/prospectus-2026-27/", 250);
    const values = buildSlotValues({ guardianName: "Anil", centreMapLink: maps, prospectusLink: prospectus });
    expect(values.centre_map_link).toBe(maps);
    expect(values.prospectus_link).toBe(prospectus);
    const filled = fillTemplate("Map: {centre_map_link} Prospectus: {prospectus_link}. Thanks.", values);
    expect(filled).toBe(`Map: ${maps} Prospectus: ${prospectus}. Thanks.`);
    expect(leftoverSlots(filled)).toEqual([]);
    const seeded = SEED_TEMPLATES_1B.find((seed) => seed.key === "centre_location")?.en ?? "";
    expect(fillTemplate(seeded, values)).toContain(maps);
    // A link is used whole or not at all: over 300 characters, not https, or with spaces / braces → the slot stays.
    const tooLong = padTo("https://www.google.com/maps/place/", 301);
    expect(buildSlotValues({ centreMapLink: tooLong }).centre_map_link).toBeUndefined();
    for (const bad of [tooLong, "http://maps.example.org/x", "javascript:alert(1)", "https://a.example.org/{x}", "https://a.example.org/a b"]) {
      const text = fillTemplate("Map: {centre_map_link}.", { centre_map_link: bad });
      expect(text, bad).toBe("Map: {centre_map_link}.");
      expect(composerIssues(text), bad).toEqual(["slots"]);
    }
    // Other slots keep the 120-character cap.
    expect(fillTemplate("Hi {parent_name}.", { parent_name: "y".repeat(200) })).toBe(`Hi ${"y".repeat(120)}.`);
  });

  it("leaves unfilled slots for staff and keeps the composer blocked until they are filled", () => {
    const body = SEED_TEMPLATES_1B.find((seed) => seed.key === "visit_invite")?.en ?? "";
    const text = fillTemplate(body, { parent_name: "Anil", centre: "Shimla" });
    expect(leftoverSlots(text)).toEqual(["student_first_name", "date", "time", "centre_map_link", "counsellor_name"]);
    expect(composerIssues(text)).toEqual(["slots"]);
    expect(composerIssues("")).toEqual(["empty"]);
    expect(composerIssues("a".repeat(WA_TEXT_MAX + 1))).toEqual(["tooLong"]);
    expect(composerIssues("Namaste Anil ji.")).toEqual([]);
    expect(fillTemplate("Namaste {unknown_slot}.", {})).toBe("Namaste {unknown_slot}.");
    expect(TEMPLATE_SLOTS).toContain("test_date");
  });

  it("encodes the wa.me text (Hindi round-trip) and only for a usable number", () => {
    const text = "नमस्ते अनिल जी, कल 10 बजे आइए & पूछिए? #1";
    const href = waMeHref("+916000012345", text);
    expect(href?.startsWith("https://wa.me/916000012345?text=")).toBe(true);
    expect(new URL(href ?? "").searchParams.get("text")).toBe(text);
    expect(waMeHref("12", text)).toBeNull();
    expect(waMeHref(null, text)).toBeNull();
  });
});

describe("erase keeps the template facts (D-042, §3)", () => {
  it("a confirmed WhatsApp keeps { outcome, template, lang } after erase; the text is gone", () => {
    const { sa } = people();
    ensureTemplatesSeeded(db(), T0);
    expect(setTemplateStatus(sa, "first_contact", { status: "approved", expectedVersion: 1 }, T0).ok).toBe(true);
    const counsellor = viewerOf(staff("exec.two", "counsellor").id, "staff");
    const captured = lead({ studentName: "Riya Sharma" });
    const owner = captured.assigneeId === counsellor.userId ? counsellor : sa;
    const result = recordOutcome(
      owner,
      captured.leadId,
      { contact: { channel: "whatsapp", outcome: "message_sent", note: "Sent the welcome", template: { key: "first_contact", lang: "hinglish" } }, next: { kind: "preset", preset: "tomorrow" } },
      T0,
    );
    expect(result.ok).toBe(true);
    expect(eraseLead(sa, captured.leadId, T0 + 1000, { reason: "family_request" }).ok).toBe(true);
    const row = db().prepare("SELECT body, meta FROM crm_activities WHERE lead_id = ? AND type = 'whatsapp'").get(captured.leadId);
    expect(row?.body).toBeNull();
    expect(JSON.parse(String(row?.meta))).toEqual({ outcome: "message_sent", template: "first_contact", lang: "hinglish" });
  });
});
