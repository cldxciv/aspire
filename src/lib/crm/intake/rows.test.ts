import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseCsv } from "./csv";
import { decodeCsvBytes } from "./decode";
import {
  buildImportRows,
  chunkImportRows,
  cleanImportPhone,
  guessImportTarget,
  guessMapping,
  inFileKey,
  mappingIssues,
  maskImportPhone,
  matchImportCentre,
  normaliseHeader,
  normaliseImportClass,
  normaliseImportProgram,
  normaliseSubmittedBy,
  parseImportBoolean,
  parseImportTime,
  parseMetaLeadId,
  parseMetaObjectId,
  statusBucket,
  type ImportRowInput,
} from "./rows";

const CENTRES = [
  { slug: "shimla", names: ["Shimla BCS Head Campus", "शिमला बीसीएस मुख्य परिसर"] },
  { slug: "hamirpur", names: ["Hamirpur Central Hub"] },
  { slug: "dharamshala", names: ["Dharamshala Kangra Hub"] },
  { slug: "kullu", names: ["Kullu Valley Centre"] },
];

function load(name: string) {
  const decoded = decodeCsvBytes(new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)))));
  const parsed = parseCsv(decoded.text);
  if (!parsed.ok) throw new Error(parsed.issue);
  const mapping = guessMapping(parsed.header);
  return { parsed, mapping, built: buildImportRows(parsed.header, parsed.rows, mapping, { centres: CENTRES, encoding: decoded.encoding }) };
}

describe("header guessing", () => {
  it("normalises headers", () => {
    expect(normaliseHeader(" Phone Number ")).toBe("phone_number");
    expect(normaliseHeader("which_district_do_you_live_in?")).toBe("which_district_do_you_live_in");
    expect(normaliseHeader("Parent/Guardian Name")).toBe("parent_guardian_name");
  });

  it("maps Meta's export columns", () => {
    const { parsed, mapping } = load("meta-utf8-comma.csv");
    const byHeader = Object.fromEntries(parsed.header.map((h, i) => [h, mapping[i]]));
    expect(byHeader).toEqual({
      id: "metaLeadId",
      created_time: "createdTime",
      ad_id: "adId",
      ad_name: "adName",
      adset_id: "ignore",
      adset_name: "adsetName",
      campaign_id: "campaignId",
      campaign_name: "campaignName",
      form_id: "formId",
      form_name: "formName",
      is_organic: "isOrganic",
      platform: "platform",
      "which_district_do_you_live_in?": "district",
      "are_you_a_parent_or_student?": "submittedBy",
      "which_class_are_you_in?": "currentClass",
      "which_course_are_you_interested_in?": "programInterest",
      full_name: "contactName",
      phone_number: "phone",
      email: "email",
      i_agree_to_be_contacted_by_aspire: "consentChecked",
    });
    expect(mappingIssues(mapping)).toEqual([]);
  });

  it("maps a staff sheet's headers and sends unknown questions to answers", () => {
    expect(guessMapping(["Lead ID", "Student Name", "Parent Name", "Mobile Number", "Centre", "Message", "Notes"])).toEqual([
      "metaLeadId",
      "studentName",
      "guardianName",
      "phone",
      "centre",
      "answer",
      "answer",
    ]);
    expect(guessImportTarget("")).toBe("ignore");
    expect(guessImportTarget("Your WhatsApp number")).toBe("phone");
    expect(guessImportTarget("lead_status")).toBe("ignore");
  });

  it("uses each field once and requires a phone column", () => {
    expect(guessMapping(["phone", "mobile"])).toEqual(["phone", "answer"]);
    expect(mappingIssues(["contactName", "answer"])).toEqual(["phone_unmapped"]);
    expect(mappingIssues(["phone", "district", "district"])).toEqual(["duplicate_target"]);
  });
});

describe("value normalisers", () => {
  it("accepts only strict Meta lead ids (A3: no digit stripping)", () => {
    expect(parseMetaLeadId("l:1234567890123451")).toBe("1234567890123451");
    expect(parseMetaLeadId("123456789012345")).toBe("123456789012345");
    expect(parseMetaLeadId("12345678901234567")).toBe("12345678901234567");
    expect(parseMetaLeadId("'1234567890123451")).toBe("1234567890123451");
    for (const bad of ["12345678901234", "123456789012345678", "1234-5678-9012-3451", "l: 1234567890123451x", "1.23457E+15", "L:1234567890123451", "", null]) {
      expect(parseMetaLeadId(bad), String(bad)).toBeNull();
    }
  });

  it("reads form / ad / campaign ids with their export prefixes", () => {
    expect(parseMetaObjectId("f:900000000000001")).toBe("900000000000001");
    expect(parseMetaObjectId("ag:120200000000000001")).toBe("120200000000000001");
    expect(parseMetaObjectId("c:12x")).toBeNull();
  });

  it("cleans phones: p: prefix, apostrophe, .0", () => {
    expect(cleanImportPhone("p:+916000010001")).toBe("+916000010001");
    expect(cleanImportPhone("'+916000010042")).toBe("+916000010042");
    expect(cleanImportPhone("6000010043.0")).toBe("6000010043");
    expect(cleanImportPhone("  ")).toBeNull();
  });

  it("masks phones as +91 98•••••210", () => {
    expect(maskImportPhone("+919812345210")).toBe("+91 98•••••210");
    expect(maskImportPhone("+447700900123")).toBeNull();
    expect(maskImportPhone(null)).toBeNull();
  });

  it("parses Meta times (zones with and without a colon; IST when none)", () => {
    expect(parseImportTime("2026-10-21T04:45:30+0000")).toBe("2026-10-21T04:45:30.000Z");
    expect(parseImportTime("2026-10-21T10:15:30+05:30")).toBe("2026-10-21T04:45:30.000Z");
    expect(parseImportTime("2026-10-21T04:45:30Z")).toBe("2026-10-21T04:45:30.000Z");
    expect(parseImportTime("2026-10-21 10:15")).toBe("2026-10-21T04:45:00.000Z");
    expect(parseImportTime("2026-10-21")).toBe("2026-10-20T18:30:00.000Z");
    for (const bad of ["21/10/2026", "yesterday", "2026-13-40", "1999-01-01", ""]) expect(parseImportTime(bad), bad).toBeNull();
  });

  it("normalises class, programme, submitter and yes/no answers", () => {
    expect(["Class 11", "11", "XI", "11th", "कक्षा 11"].map(normaliseImportClass)).toEqual(Array(5).fill("class-11"));
    expect(["Class 8", "6", "vii"].map(normaliseImportClass)).toEqual(Array(3).fill("class-6-8"));
    expect(["Dropper", "12th pass", "Repeater"].map(normaliseImportClass)).toEqual(Array(3).fill("dropper"));
    expect(normaliseImportClass("12th")).toBe("class-12");
    expect(normaliseImportClass("College")).toBeNull();
    expect(["NEET", "Medical", "AIIMS"].map(normaliseImportProgram)).toEqual(Array(3).fill("neet"));
    expect(["JEE Main + Advanced", "IIT", "Engineering"].map(normaliseImportProgram)).toEqual(Array(3).fill("jee"));
    expect(normaliseImportProgram("Not sure yet")).toBe("not-sure");
    expect(normaliseImportProgram("Foundation")).toBe("foundation");
    expect(normaliseImportProgram("JEE or NEET")).toBeNull();
    expect(["Parent", "Mother", "अभिभावक", "I am the guardian"].map(normaliseSubmittedBy)).toEqual(Array(4).fill("parent"));
    expect(["Student", "Myself", "छात्र"].map(normaliseSubmittedBy)).toEqual(Array(3).fill("student"));
    expect(normaliseSubmittedBy("Parent of a student")).toBeNull();
    expect(["true", "Yes", "✓", "हाँ"].map(parseImportBoolean)).toEqual(Array(4).fill(true));
    expect(["false", "No", "0"].map(parseImportBoolean)).toEqual(Array(3).fill(false));
    expect(parseImportBoolean("maybe")).toBeNull();
  });

  it("matches centres by slug, name or a common spelling", () => {
    expect(matchImportCentre("Dharamsala", CENTRES)).toBe("dharamshala");
    expect(matchImportCentre("Hamirpur Central Hub", CENTRES)).toBe("hamirpur");
    expect(matchImportCentre("शिमला बीसीएस मुख्य परिसर", CENTRES)).toBe("shimla");
    expect(matchImportCentre("Mandi", CENTRES)).toBeNull();
  });
});

describe("buildImportRows", () => {
  it("builds rows from the UTF-8 Meta export", () => {
    const { built } = load("meta-utf8-comma.csv");
    expect(built.local).toEqual([]);
    expect(built.rows).toHaveLength(4);
    expect(built.rows[0]).toEqual({
      row: 2,
      metaLeadId: "l:1234567890123451",
      createdTime: "2026-10-21T04:45:30.000Z",
      adId: "120200000000000001",
      adName: "Shimla NEET Oct",
      adsetName: "Class 11-12 parents",
      campaignId: "120200000000000003",
      campaignName: "NEET 2027 admissions",
      formId: "900000000000001",
      formName: "NEET enquiry v2",
      isOrganic: false,
      platform: "fb",
      district: "Shimla",
      submittedBy: "parent",
      currentClass: "class-11",
      programInterest: "neet",
      contactName: "Asha Test",
      phone: "+916000010001",
      email: "asha.test@example.com",
      consentChecked: true,
    });
    expect(built.rows[1]).toMatchObject({ platform: "ig", district: "Dharamshala", submittedBy: "student", currentClass: "class-12", programInterest: "jee" });
    expect(built.rows[2]).toMatchObject({ contactName: 'Meera "Mini" Demo', district: "Manali, HP", campaignName: "Foundation, Kullu" });
    // An answer we could not normalise is kept as text, never dropped.
    expect(built.rows[3]).toMatchObject({ programInterest: "not-sure", consentChecked: false, currentClass: "class-10" });
  });

  it("builds rows from Meta's UTF-16 download with Hindi answers", () => {
    const { built } = load("meta-utf16le-tab.csv");
    expect(built.rows.map((r) => [r.metaLeadId, r.phone, r.district])).toEqual([
      ["l:1234567890123461", "+916000010011", "धर्मशाला"],
      ["l:1234567890123462", "+916000010012", "Baddi"],
      ["l:1234567890123463", "+916000010013", "Keylong"],
    ]);
    expect(built.rows[0]).toMatchObject({ submittedBy: "parent", currentClass: "class-11", contactName: "सीमा परीक्षण" });
    expect(built.rows[1]).toMatchObject({ currentClass: "dropper", programInterest: "neet" });
    expect(built.rows[2].consentChecked).toBeUndefined();
  });

  it("keeps unreadable class / course answers in the answers text", () => {
    const parsed = parseCsv("phone,class,course,Any question?\n6000010001,College,JEE or NEET,Hostel needed\n");
    if (!parsed.ok) throw new Error();
    const built = buildImportRows(parsed.header, parsed.rows, guessMapping(parsed.header));
    expect(built.rows[0].currentClass).toBeNull();
    expect(built.rows[0].programInterest).toBeNull();
    expect(built.rows[0].answers).toBe("class: College\ncourse: JEE or NEET\nAny question?: Hostel needed");
  });

  it("flags Excel damage and repairs the harmless artefacts", () => {
    const { built } = load("excel-damaged.csv");
    expect(built.rows.map((r) => [r.row, r.damaged ?? []])).toEqual([
      [2, ["id_sci", "phone_sci"]],
      [3, ["id_truncated"]],
      [4, []],
      [5, []],
    ]);
    expect(built.rows[1].phone).toBe("+916000010042");
    expect(built.rows[2].phone).toBe("6000010043");
    expect(built.rows[3].phone).toBe("6000010044");
  });

  it("judges cut ids by column: a real id ending in 00 is not flagged", () => {
    const rowsOf = (csv: string, encoding?: "utf-8" | "windows-1252") => {
      const parsed = parseCsv(csv);
      if (!parsed.ok) throw new Error(parsed.issue);
      return buildImportRows(parsed.header, parsed.rows, guessMapping(parsed.header), { encoding }).rows.map((r) => r.damaged ?? []);
    };
    // A clean download: one id ends in 00, the others do not end in 0.
    expect(rowsOf("id,phone_number\n1290430178445200,6000010081\n1290430178445211,6000010082\n1290430178445223,6000010083\n")).toEqual([[], [], []]);
    // The whole column ends in 0: Excel cut it.
    expect(rowsOf("id,phone_number\n1290430178445200,6000010081\n1290430178445210,6000010082\n1290430178445220,6000010083\n")).toEqual([
      ["id_truncated"],
      ["id_truncated"],
      ["id_truncated"],
    ]);
    // Too few ids to judge the column: "…00" counts only with another Excel sign.
    expect(rowsOf("id,phone_number\n1290430178445200,6000010081\n")).toEqual([[]]);
    expect(rowsOf("id,phone_number\n1290430178445200,6000010081.0\n")).toEqual([["id_truncated"]]);
    expect(rowsOf("id,phone_number\n1290430178445200,6000010081\n", "windows-1252")).toEqual([["id_truncated"]]);
  });

  it("flags garbled names and places, and leaves garbled answers out", () => {
    const { built } = load("windows-1252.csv");
    expect(built.rows[0]).toMatchObject({ contactName: "Renée Sample", district: "Mandi", answers: "notes: Café visit" });
    expect(built.rows[1].damaged).toEqual(["text_mojibake"]);
    expect(built.rows[1].contactName).toBeUndefined();
    expect(built.garbledAnswers).toBe(1);
  });

  it("drops in-file duplicates, keeps row numbers, routes an unmatched centre as a place", () => {
    const { built } = load("mixed-quality.csv");
    expect(built.local).toEqual([{ row: 7, status: "duplicate_in_file" }]);
    expect(built.rows.map((r) => r.row)).toEqual([2, 3, 4, 5, 6, 9]);
    expect(built.rows[0]).toMatchObject({ studentName: "Valid One", guardianName: "Parent One", centre: "dharamshala", state: "Himachal Pradesh", answers: "Message: Please call after 5, not before" });
    expect(built.rows[1].metaLeadId).toBeUndefined();
    expect(built.rows[3].phone).toBeUndefined();
    // "Pathankot" was typed as the district; the unmatched centre "Mandi" is not used over it.
    expect(built.rows[5]).toMatchObject({ district: "Pathankot", state: "Punjab", centre: null });
  });

  it("uses the server's idempotency key for in-file duplicates", () => {
    expect(inFileKey({ row: 2, metaLeadId: "l:1234567890123451", phone: "+916000010001" })).toBe("meta:1234567890123451");
    expect(inFileKey({ row: 2, phone: "6000010001", createdTime: "t", formId: "9" })).toBe("csv:+916000010001|t|9");
    expect(inFileKey({ row: 2, phone: "12" })).toBeNull();
  });

  it("maps statuses to the batch counters", () => {
    expect(statusBucket("created")).toBe("created");
    expect(statusBucket("attached")).toBe("attached");
    expect(statusBucket("already_imported")).toBe("skipped");
    expect(statusBucket("erased_family")).toBe("skipped");
    expect(statusBucket("duplicate_in_file")).toBe("skipped");
    expect(statusBucket("damaged")).toBe("invalid");
    expect(statusBucket("consent_mismatch")).toBe("invalid");
  });
});

describe("chunkImportRows", () => {
  const row = (n: number, extra = ""): ImportRowInput => ({ row: n, phone: "+916000010001", answers: extra || null });

  it("splits at 250 rows", () => {
    const chunks = chunkImportRows(Array.from({ length: 600 }, (_, i) => row(i + 2)));
    expect(chunks.map((c) => c.length)).toEqual([250, 250, 100]);
    expect(chunks.flat().map((r) => r.row)).toEqual(Array.from({ length: 600 }, (_, i) => i + 2));
  });

  it("splits at 256 KB of JSON (each chunk's body stays under the limit)", () => {
    const rows = Array.from({ length: 400 }, (_, i) => row(i + 2, "x".repeat(1000)));
    const chunks = chunkImportRows(rows);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(250);
      const body = JSON.stringify({ rows: chunk, consentBasis: "meta_lead_form" });
      expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(256 * 1024);
    }
    expect(chunks.flat()).toHaveLength(400);
  });

  it("counts UTF-8 bytes, not characters (Hindi is 3 bytes a letter)", () => {
    const rows = Array.from({ length: 200 }, (_, i) => row(i + 2, "श".repeat(900)));
    for (const chunk of chunkImportRows(rows)) {
      expect(new TextEncoder().encode(JSON.stringify({ rows: chunk })).length).toBeLessThanOrEqual(256 * 1024);
    }
  });

  it("returns no chunks for no rows", () => {
    expect(chunkImportRows([])).toEqual([]);
  });
});
