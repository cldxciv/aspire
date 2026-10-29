import "server-only";

import { readFileSync, statfsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { getAskConfig } from "@/lib/ask/config";
import { showPlaceholderContent } from "@/lib/content-mode";
import { metaHealthSummary } from "@/lib/crm/meta/view";
import { getDb, MEMORY_DB_PATH, resolveDbPath } from "@/lib/db/connection";
import { countEffectiveSuperAdmins } from "@/lib/db/super-admins";
import { getLeadGateConfig } from "@/lib/lead-gate/config";
import { getEnquiryDeliveryStatus, parseEnquiryDestination, parseEnquiryStore } from "@/lib/server/env";

/**
 * Site status for /admin/status (docs/admin-phase-1b-plan.md §5.M; owner: 1B-HOUSEKEEPING).
 * Admins only, English only (decision 5). Every row is worked out on its own inside try/catch, so
 * one failure shows "Unknown" for that row and never breaks the page. Values are built from enum
 * values, counts and sizes only: never a secret, a webhook URL, a database or disk path, a mount
 * name or an environment value other than the release tag (validated, first 7 characters).
 * Read-only: nothing here writes to the database or the disk.
 */

export const STATUS_ROWS = [
  { key: "contentMode", label: "Content mode" },
  { key: "indexing", label: "Google indexing" },
  { key: "enquiries", label: "Enquiries" },
  { key: "leadGate", label: "Contact form before tools" },
  { key: "rancho", label: "Rancho (the AI doubt solver)" },
  { key: "meta", label: "Meta lead ads" },
  { key: "superAdmins", label: "Super admins" },
  { key: "release", label: "Release" },
  { key: "databaseSize", label: "Database size" },
  { key: "freeDisk", label: "Free disk" },
  { key: "snapshots", label: "Pre-release database snapshots" },
  { key: "backups", label: "Off-server backups" },
] as const;

export type StatusRowKey = (typeof STATUS_ROWS)[number]["key"];

/** ok = fine; warn = needs the owner's attention; info = a plain fact. */
export type StatusTone = "ok" | "warn" | "info";

export interface StatusRow {
  key: StatusRowKey;
  label: string;
  value: string;
  tone: StatusTone;
  /** Extra lines under the value (warnings, last disk check). */
  notes: string[];
  /** A console page with more detail (a path without the locale; the page localises it). */
  link?: { href: string; label: string };
}

export interface SiteStatus {
  rows: StatusRow[];
  /** Demo mode (placeholder content shown), or null when it could not be read. */
  demoMode: boolean | null;
  generatedAt: number;
}

export const STATUS_UNKNOWN = "Unknown";

const MB = 1024 * 1024;
const GB = 1024 * MB;
/** The deploy's disk check warns under 3 GB (deploy/disk-check.sh, WARN_GB=3). */
export const FREE_DISK_WARN_BYTES = 3 * GB;
export const FREE_DISK_WARNING = "Under 3 GB free: do not start a release build (a build needs about 2.6 GB).";
export const SNAPSHOTS_TEXT = "Taken on the server before each release, on the same disk. Not an off-server backup.";
export const BACKUPS_TEXT = "Not set up (deferred by owner, 21 Oct 2026).";
/** The disk check runs every 6 hours (deploy/aspire-web.cron); older than a day = it has stopped. */
const DISK_CHECK_STALE_MS = 24 * 60 * 60 * 1000;
/** disk-status.json is a few hundred bytes; anything much larger is not ours. */
const DISK_STATUS_MAX_BYTES = 64 * 1024;
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const LABELS: Readonly<Record<StatusRowKey, string>> = Object.fromEntries(STATUS_ROWS.map((row) => [row.key, row.label])) as Record<StatusRowKey, string>;

type MetaHealth = ReturnType<typeof metaHealthSummary>;

/** Everything the status reads, injectable for tests. Each function may throw: its row says "Unknown". */
export interface StatusSources {
  env: Readonly<Record<string, string | undefined>>;
  demoMode: () => boolean;
  dbPath: () => string;
  /** Size in bytes of a file; throws when it does not exist. */
  fileSize: (path: string) => number;
  /** Bytes free for this process on the disk holding `dir`. */
  freeBytes: (dir: string) => number;
  readText: (path: string) => string;
  superAdminCount: () => number;
  metaHealth: (now: number) => MetaHealth;
  ranchoConfigured: () => boolean;
}

export const DEFAULT_STATUS_SOURCES: StatusSources = {
  env: process.env,
  demoMode: showPlaceholderContent,
  dbPath: () => resolveDbPath(),
  fileSize: (path) => statSync(path).size,
  freeBytes: (dir) => {
    const stats = statfsSync(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  },
  readText: (path) => {
    if (statSync(path).size > DISK_STATUS_MAX_BYTES) throw new Error("too_large");
    return readFileSync(path, "utf8");
  },
  superAdminCount: () => countEffectiveSuperAdmins(getDb()),
  metaHealth: (now) => metaHealthSummary(getDb(), now),
  ranchoConfigured: () => getAskConfig().configured,
};

function row(key: StatusRowKey, value: string, tone: StatusTone, notes: string[] = [], link?: StatusRow["link"]): StatusRow {
  return link ? { key, label: LABELS[key], value, tone, notes, link } : { key, label: LABELS[key], value, tone, notes };
}

/** Runs one row's builder; any failure (or a bad value) gives "Unknown". */
function safely(key: StatusRowKey, build: () => StatusRow): StatusRow {
  try {
    return build();
  } catch {
    return row(key, STATUS_UNKNOWN, "info");
  }
}

function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

function gigabytes(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`;
}

function nonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("bad_size");
  return value;
}

const IST_TIME = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

/** "22 Oct 2026, 10:00 am IST". */
export function istTimeLabel(ms: number): string {
  return `${IST_TIME.format(new Date(ms))} IST`;
}

/**
 * "Last disk check: …" from the deploy's `disk-status.json` (deploy/disk-check.sh --status), kept next
 * to the database (`/data/ops/disk-status.json` in the container). Mount names are never shown.
 */
export function diskCheckLine(raw: string, now: number): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const doc = parsed as { checkedAt?: unknown; ok?: unknown; filesystems?: unknown };
  const checkedAt = typeof doc.checkedAt === "string" ? Date.parse(doc.checkedAt) : Number.NaN;
  if (!Number.isFinite(checkedAt)) return null;
  const free = Array.isArray(doc.filesystems)
    ? doc.filesystems
        .map((fs) => (typeof fs === "object" && fs !== null ? Number((fs as { freeBytes?: unknown }).freeBytes) : Number.NaN))
        .filter((bytes) => Number.isFinite(bytes) && bytes >= 0)
    : [];
  const parts = [`Last disk check: ${istTimeLabel(checkedAt)}`];
  if (free.length > 0) parts.push(`lowest free space ${gigabytes(Math.min(...free))}`);
  if (doc.ok === true) parts.push("OK");
  else if (doc.ok === false) parts.push("under 3 GB on at least one disk");
  if (now - checkedAt > DISK_CHECK_STALE_MS) parts.push("more than a day ago: check the disk-check job");
  return parts.join(" · ");
}

const GATE_OFF_REASONS: Readonly<Record<string, string>> = {
  unset: "not switched on",
  store_off: "enquiries are not being saved",
  no_secret: "the server key is missing",
};

/** Builds every row of the plan's §5.M table. Never throws. */
export function buildSiteStatus(now: number, sources: StatusSources = DEFAULT_STATUS_SOURCES): SiteStatus {
  const { env } = sources;
  let demoMode: boolean | null = null;
  try {
    demoMode = sources.demoMode() === true;
  } catch {
    demoMode = null;
  }
  let dbPath: string | null = null;
  try {
    dbPath = sources.dbPath();
  } catch {
    dbPath = null;
  }

  const rows: StatusRow[] = [
    safely("contentMode", () => {
      if (demoMode === null) throw new Error("unknown");
      return demoMode ? row("contentMode", "Demo", "info", ["Placeholder records are shown, each labelled DEMO."]) : row("contentMode", "Production", "ok");
    }),
    safely("indexing", () => {
      if (demoMode === null) throw new Error("unknown");
      return demoMode ? row("indexing", "Blocked (demo)", "info") : row("indexing", "Allowed", "ok");
    }),
    safely("enquiries", () => {
      const stored = parseEnquiryStore(env).mode === "crm";
      const webhook = parseEnquiryDestination(env).config.kind === "webhook";
      if (getEnquiryDeliveryStatus(env) === "not_configured") {
        return row("enquiries", "Not saved and not forwarded", "warn", ["The enquiry form tells families that online enquiries are not connected."]);
      }
      const saved = stored ? "Saved as CRM leads" : "Not saved in the CRM";
      return row("enquiries", `${saved} · webhook ${webhook ? "connected" : "not connected"}`, stored ? "ok" : "warn");
    }),
    safely("leadGate", () => {
      const gate = getLeadGateConfig(env);
      if (gate.mode === "required") return row("leadGate", "Required before results", "ok");
      if (gate.mode === "optional") return row("leadGate", "Optional", "ok");
      const reason = GATE_OFF_REASONS[gate.offReason ?? "unset"] ?? GATE_OFF_REASONS.unset;
      return row("leadGate", `Off: ${reason}`, "info");
    }),
    safely("rancho", () =>
      sources.ranchoConfigured() ? row("rancho", "Configured", "ok") : row("rancho", "Not configured (no API key on the server)", "warn"),
    ),
    safely("meta", () => {
      const link = { href: "/crm/settings/integrations", label: "Meta lead ads settings" };
      const health = sources.metaHealth(now);
      if (health === null) return row("meta", "Off (not switched on)", "info", [], link);
      if (health.paused === "auth") return row("meta", "Paused: the Meta sign-in needs renewing", "warn", [], link);
      if (health.paused === "permission") return row("meta", "Paused: a Meta permission is missing", "warn", [], link);
      const pending = nonNegative(health.pending);
      const failed = nonNegative(health.failed);
      return row("meta", `On · ${pending} waiting · ${failed} failed`, failed > 0 ? "warn" : "ok", [], link);
    }),
    safely("superAdmins", () => {
      const count = nonNegative(sources.superAdminCount());
      return count > 0
        ? row("superAdmins", String(count), "ok")
        : row("superAdmins", "0", "warn", ["Without a super admin nobody can change settings or staff logins."]);
    }),
    safely("release", () => {
      const raw = (env.RELEASE ?? "").trim();
      return RELEASE_PATTERN.test(raw) ? row("release", raw.slice(0, 7), "info") : row("release", STATUS_UNKNOWN, "info");
    }),
    safely("databaseSize", () => {
      if (!dbPath || dbPath === MEMORY_DB_PATH) throw new Error("no_file");
      const main = nonNegative(sources.fileSize(dbPath));
      let wal = 0;
      try {
        wal = nonNegative(sources.fileSize(`${dbPath}-wal`));
      } catch {
        wal = 0; // no write-ahead log right now
      }
      return row("databaseSize", megabytes(main + wal), "info");
    }),
    safely("freeDisk", () => {
      if (!dbPath) throw new Error("no_path");
      const dir = dirname(dbPath === MEMORY_DB_PATH ? resolveDbPath({}, process.cwd()) : dbPath);
      const free = nonNegative(sources.freeBytes(dir));
      const notes: string[] = [];
      const low = free < FREE_DISK_WARN_BYTES;
      if (low) notes.push(FREE_DISK_WARNING);
      try {
        const line = diskCheckLine(sources.readText(join(dir, "ops", "disk-status.json")), now);
        if (line) notes.push(line);
      } catch {
        // No disk check recorded on this machine (local runs): nothing to add.
      }
      return row("freeDisk", `${gigabytes(free)} free`, low ? "warn" : "ok", notes);
    }),
    row("snapshots", SNAPSHOTS_TEXT, "info"),
    row("backups", BACKUPS_TEXT, "warn"),
  ];
  return { rows, demoMode, generatedAt: now };
}
