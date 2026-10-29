import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GO_LIVE_AS_OF, GO_LIVE_ITEMS, GO_LIVE_NOTE, goLiveStatusText } from "./go-live";
import {
  BACKUPS_TEXT,
  buildSiteStatus,
  diskCheckLine,
  FREE_DISK_WARN_BYTES,
  FREE_DISK_WARNING,
  SNAPSHOTS_TEXT,
  STATUS_ROWS,
  STATUS_UNKNOWN,
  type SiteStatus,
  type StatusSources,
} from "./status";

// Synthetic values only: the paths, secrets and mount names below must never reach the output.
const NOW = Date.UTC(2026, 9, 22, 6, 0);
const DB_PATH = "/srv/secret-place/data/aspire.sqlite";
const MB = 1024 * 1024;
const GB = 1024 * MB;
const SECRETS = {
  ANTHROPIC_API_KEY: "sk-ant-synthetic-secret-123",
  ENQUIRY_WEBHOOK_URL: "https://hooks.example.com/hidden-hook-path",
  ENQUIRY_WEBHOOK_SECRET: "webhook-secret-synthetic-0123456789",
  LEAD_GATE_SECRET: "lead-gate-secret-synthetic-0123456789-abcdef",
};

const DISK_STATUS = JSON.stringify({
  schema: 1,
  checkedAt: "2026-10-22T04:30:00Z",
  warnBelowBytes: 3 * GB,
  ok: true,
  filesystems: [
    { mount: "/mnt/hidden-volume", freeBytes: 12 * GB, sizeBytes: 40 * GB },
    { mount: "/var/lib/docker-hidden", freeBytes: 9 * GB, sizeBytes: 40 * GB },
  ],
});

function sources(overrides: Partial<StatusSources> = {}): StatusSources {
  return {
    env: process.env,
    demoMode: () => true,
    dbPath: () => DB_PATH,
    fileSize: (path) => {
      if (path === DB_PATH) return 20 * MB;
      if (path === `${DB_PATH}-wal`) return 4.5 * MB;
      throw new Error("ENOENT");
    },
    freeBytes: () => 10 * GB,
    readText: (path) => {
      if (path.replace(/\\/g, "/").endsWith("/data/ops/disk-status.json")) return DISK_STATUS;
      throw new Error("ENOENT");
    },
    superAdminCount: () => 2,
    metaHealth: () => null,
    ranchoConfigured: () => true,
    ...overrides,
  };
}

function rowOf(status: SiteStatus, key: string) {
  const found = status.rows.find((row) => row.key === key);
  if (!found) throw new Error(`no row ${key}`);
  return found;
}

beforeEach(() => {
  vi.stubEnv("RELEASE", "5a2d7cb9e1f0");
  vi.stubEnv("ENQUIRY_STORE", "crm");
  vi.stubEnv("ENQUIRY_DESTINATION", "webhook");
  vi.stubEnv("ENQUIRY_WEBHOOK_URL", SECRETS.ENQUIRY_WEBHOOK_URL);
  vi.stubEnv("ENQUIRY_WEBHOOK_SECRET", SECRETS.ENQUIRY_WEBHOOK_SECRET);
  vi.stubEnv("ANTHROPIC_API_KEY", SECRETS.ANTHROPIC_API_KEY);
  vi.stubEnv("LEAD_GATE", "required");
  vi.stubEnv("LEAD_GATE_SECRET", SECRETS.LEAD_GATE_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("site status rows (plan §5.M)", () => {
  it("builds every row of the table, in order, with labels", () => {
    const status = buildSiteStatus(NOW, sources());
    expect(status.rows.map((row) => row.key)).toEqual(STATUS_ROWS.map((row) => row.key));
    expect(status.rows.map((row) => row.label)).toEqual([
      "Content mode",
      "Google indexing",
      "Enquiries",
      "Contact form before tools",
      "Rancho (the AI doubt solver)",
      "Meta lead ads",
      "Super admins",
      "Release",
      "Database size",
      "Free disk",
      "Pre-release database snapshots",
      "Off-server backups",
    ]);
    expect(status.generatedAt).toBe(NOW);
  });

  it("content mode and indexing follow the demo switch", () => {
    const demo = buildSiteStatus(NOW, sources({ demoMode: () => true }));
    expect(rowOf(demo, "contentMode").value).toBe("Demo");
    expect(rowOf(demo, "indexing").value).toBe("Blocked (demo)");
    expect(demo.demoMode).toBe(true);
    const live = buildSiteStatus(NOW, sources({ demoMode: () => false }));
    expect(rowOf(live, "contentMode").value).toBe("Production");
    expect(rowOf(live, "indexing").value).toBe("Allowed");
    expect(live.demoMode).toBe(false);
  });

  it("enquiries: saved as leads, webhook connected or not, or nowhere", () => {
    expect(rowOf(buildSiteStatus(NOW, sources()), "enquiries")).toMatchObject({ value: "Saved as CRM leads · webhook connected", tone: "ok" });
    vi.stubEnv("ENQUIRY_DESTINATION", "");
    expect(rowOf(buildSiteStatus(NOW, sources()), "enquiries").value).toBe("Saved as CRM leads · webhook not connected");
    vi.stubEnv("ENQUIRY_STORE", "off");
    expect(rowOf(buildSiteStatus(NOW, sources()), "enquiries")).toMatchObject({ value: "Not saved and not forwarded", tone: "warn" });
  });

  it("contact form before tools: required, optional, or off with the reason", () => {
    expect(rowOf(buildSiteStatus(NOW, sources()), "leadGate").value).toBe("Required before results");
    vi.stubEnv("LEAD_GATE", "optional");
    expect(rowOf(buildSiteStatus(NOW, sources()), "leadGate").value).toBe("Optional");
    vi.stubEnv("LEAD_GATE", "");
    expect(rowOf(buildSiteStatus(NOW, sources()), "leadGate").value).toBe("Off: not switched on");
    vi.stubEnv("LEAD_GATE", "required");
    vi.stubEnv("ENQUIRY_STORE", "off");
    expect(rowOf(buildSiteStatus(NOW, sources()), "leadGate").value).toBe("Off: enquiries are not being saved");
  });

  it("Rancho, Meta lead ads and super admins", () => {
    expect(rowOf(buildSiteStatus(NOW, sources()), "rancho").value).toBe("Configured");
    expect(rowOf(buildSiteStatus(NOW, sources({ ranchoConfigured: () => false })), "rancho").value).toBe("Not configured (no API key on the server)");

    const off = rowOf(buildSiteStatus(NOW, sources()), "meta");
    expect(off).toMatchObject({ value: "Off (not switched on)", link: { href: "/crm/settings/integrations" } });
    const health = { pending: 2, failed: 1, paused: null, silentHours: null, lastWebhookAt: null, lastImportAt: null };
    expect(rowOf(buildSiteStatus(NOW, sources({ metaHealth: () => health })), "meta")).toMatchObject({ value: "On · 2 waiting · 1 failed", tone: "warn" });
    expect(rowOf(buildSiteStatus(NOW, sources({ metaHealth: () => ({ ...health, paused: "auth" }) })), "meta").value).toBe(
      "Paused: the Meta sign-in needs renewing",
    );

    expect(rowOf(buildSiteStatus(NOW, sources()), "superAdmins")).toMatchObject({ value: "2", tone: "ok" });
    expect(rowOf(buildSiteStatus(NOW, sources({ superAdminCount: () => 0 })), "superAdmins")).toMatchObject({ value: "0", tone: "warn" });
  });

  it("release: the first 7 characters of RELEASE, or Unknown", () => {
    expect(rowOf(buildSiteStatus(NOW, sources()), "release").value).toBe("5a2d7cb");
    vi.stubEnv("RELEASE", "");
    expect(rowOf(buildSiteStatus(NOW, sources()), "release").value).toBe(STATUS_UNKNOWN);
    vi.stubEnv("RELEASE", "../../etc/passwd");
    expect(rowOf(buildSiteStatus(NOW, sources()), "release").value).toBe(STATUS_UNKNOWN);
  });

  it("database size adds the write-ahead log; a missing log counts as 0", () => {
    expect(rowOf(buildSiteStatus(NOW, sources()), "databaseSize").value).toBe("24.5 MB");
    const noWal = sources({
      fileSize: (path) => {
        if (path === DB_PATH) return 3 * MB;
        throw new Error("ENOENT");
      },
    });
    expect(rowOf(buildSiteStatus(NOW, noWal), "databaseSize").value).toBe("3.0 MB");
    // An in-memory database has no file.
    expect(rowOf(buildSiteStatus(NOW, sources({ dbPath: () => ":memory:" })), "databaseSize").value).toBe(STATUS_UNKNOWN);
  });

  it("free disk warns under 3 GB with the build note, and shows the last disk check without mount names", () => {
    const ok = rowOf(buildSiteStatus(NOW, sources({ freeBytes: () => FREE_DISK_WARN_BYTES })), "freeDisk");
    expect(ok.value).toBe("3.0 GB free");
    expect(ok.tone).toBe("ok");
    expect(ok.notes).not.toContain(FREE_DISK_WARNING);
    expect(ok.notes.join(" ")).toContain("Last disk check: 22 Oct 2026");
    expect(ok.notes.join(" ")).toContain("lowest free space 9.0 GB");

    const low = rowOf(buildSiteStatus(NOW, sources({ freeBytes: () => FREE_DISK_WARN_BYTES - 1 })), "freeDisk");
    expect(low.tone).toBe("warn");
    expect(low.notes[0]).toBe("Under 3 GB free: do not start a release build (a build needs about 2.6 GB).");

    // No disk-status.json on this machine: no line, no error.
    const none = rowOf(buildSiteStatus(NOW, sources({ readText: () => { throw new Error("ENOENT"); } })), "freeDisk");
    expect(none).toMatchObject({ value: "10.0 GB free", notes: [] });
  });

  it("the disk-check line: stale checks and broken files", () => {
    expect(diskCheckLine(DISK_STATUS, NOW)).toBe("Last disk check: 22 Oct 2026, 10:00 am IST · lowest free space 9.0 GB · OK");
    expect(diskCheckLine(DISK_STATUS, NOW + 2 * 24 * 3_600_000)).toContain("more than a day ago");
    expect(diskCheckLine(JSON.stringify({ checkedAt: "2026-10-22T04:30:00Z", ok: false, filesystems: [] }), NOW)).toContain("under 3 GB on at least one disk");
    for (const broken of ["", "{", "[]", JSON.stringify({ checkedAt: "yesterday" }), "null"]) expect(diskCheckLine(broken, NOW)).toBeNull();
  });

  it("snapshots and off-server backups are fixed, honest lines (never a fake last backup)", () => {
    const status = buildSiteStatus(NOW, sources());
    expect(rowOf(status, "snapshots").value).toBe(SNAPSHOTS_TEXT);
    expect(SNAPSHOTS_TEXT).toBe("Taken on the server before each release, on the same disk. Not an off-server backup.");
    expect(rowOf(status, "backups")).toMatchObject({ value: BACKUPS_TEXT, tone: "warn" });
    expect(BACKUPS_TEXT).toBe("Not set up (deferred by owner, 21 Oct 2026).");
    expect(JSON.stringify(status)).not.toMatch(/last backup/i);
  });

  it("every failing source gives Unknown for its row only, and the build never throws", () => {
    const boom = () => {
      throw new Error("boom");
    };
    const status = buildSiteStatus(
      NOW,
      sources({ demoMode: boom, dbPath: boom, fileSize: boom, freeBytes: boom, readText: boom, superAdminCount: boom, metaHealth: boom, ranchoConfigured: boom }),
    );
    for (const key of ["contentMode", "indexing", "rancho", "meta", "superAdmins", "databaseSize", "freeDisk"]) {
      expect(rowOf(status, key).value, key).toBe(STATUS_UNKNOWN);
    }
    expect(status.demoMode).toBeNull();
    // Rows that read only the environment still work.
    expect(rowOf(status, "release").value).toBe("5a2d7cb");
    expect(rowOf(status, "enquiries").value).toContain("Saved as CRM leads");
    // Nonsense numbers are not shown either.
    const nonsense = buildSiteStatus(NOW, sources({ freeBytes: () => Number.NaN, superAdminCount: () => -1 }));
    expect(rowOf(nonsense, "freeDisk").value).toBe(STATUS_UNKNOWN);
    expect(rowOf(nonsense, "superAdmins").value).toBe(STATUS_UNKNOWN);
  });

  it("shows no absolute path, mount name or secret", () => {
    const health = { pending: 0, failed: 0, paused: null, silentHours: null, lastWebhookAt: null, lastImportAt: null };
    for (const status of [buildSiteStatus(NOW, sources({ metaHealth: () => health })), buildSiteStatus(NOW, sources({ freeBytes: () => GB }))]) {
      const text = JSON.stringify(status);
      for (const leak of [DB_PATH, "secret-place", "/srv", "hidden-volume", "docker-hidden", "disk-status.json", ...Object.values(SECRETS), "hooks.example.com"]) {
        expect(text, leak).not.toContain(leak);
      }
      // The only path-like values are console links.
      expect(text.match(/"\/[^"]*"/g) ?? []).toEqual(['"/crm/settings/integrations"']);
      expect(text).not.toMatch(/[A-Za-z]:\\/);
    }
  });
});

describe("go-live summary (static, 22 Oct 2026)", () => {
  it("lists the plan's items with their refs and statuses", () => {
    expect(GO_LIVE_AS_OF).toBe("22 Oct 2026");
    expect(GO_LIVE_NOTE).toBe("This list is a summary from the approval checklist (22 Oct 2026). It does not update itself until Phase 3a.");
    expect(GO_LIVE_ITEMS.map((item) => [item.item, item.refs, item.status])).toEqual([
      ["Named results and photos: consent recorded", "RC-1, RE-2–RE-4", "open"],
      ["Consent wording and privacy notice reviewed by legal", "FP-3, FP-6, FP-11, CRM-2", "open"],
      ["Centre facts verified", "CE-1–CE-7, decision 7", "open"],
      ["Programmes and figures verified", "PR-2–PR-4, ST-1–ST-5", "open"],
      ["Production domain final", "HE-9, decision 17", "open"],
      ["WhatsApp templates approved", "WA-1–WA-8", "open"],
      ["Off-server backups", "—", "deferred"],
      ["Leave demo mode", "—", "live_mode"],
      ["Search indexing on the real domain", "—", "phase4"],
    ]);
    expect(new Set(GO_LIVE_ITEMS.map((item) => item.key)).size).toBe(GO_LIVE_ITEMS.length);
  });

  it("status words; 'Leave demo mode' follows the live mode, '—' when not read", () => {
    expect(goLiveStatusText("open", true).text).toBe("Open");
    expect(goLiveStatusText("deferred", true).text).toBe("Deferred");
    expect(goLiveStatusText("phase4", false).text).toBe("Phase 4");
    expect(goLiveStatusText("live_mode", true)).toEqual({ text: "Open (the site is in demo mode)", tone: "open" });
    expect(goLiveStatusText("live_mode", false)).toEqual({ text: "Done (production mode)", tone: "done" });
    expect(goLiveStatusText("live_mode", null)).toEqual({ text: "—", tone: "unknown" });
  });
});
