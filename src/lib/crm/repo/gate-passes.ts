import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { GateSubmitter } from "../types";
import { text } from "./rows";

/** `crm_gate_passes`: lead-gate passes (docs/lead-gate-plan.md §3). Epoch-ms times. */

export interface GatePassRow {
  passHash: string;
  leadId: string;
  createdAt: number;
  expiresAt: number;
  consentVersion: string;
  submittedBy: GateSubmitter | null;
  /** The consent given with this pass covers noting tool use. */
  recordUse: boolean;
}

export function insertGatePass(db: DatabaseSync, row: GatePassRow): void {
  db.prepare(
    `INSERT INTO crm_gate_passes (pass_hash, lead_id, created_at, expires_at, consent_version, submitted_by, record_use)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.passHash, row.leadId, row.createdAt, row.expiresAt, row.consentVersion, row.submittedBy, row.recordUse ? 1 : 0);
}

/** A live pass: not expired, and its lead exists and is not erased. */
export function findLiveGatePass(db: DatabaseSync, passHash: string, now: number): GatePassRow | null {
  const row = db
    .prepare(
      `SELECT p.pass_hash, p.lead_id, p.created_at, p.expires_at, p.consent_version, p.submitted_by, p.record_use
         FROM crm_gate_passes p JOIN crm_leads l ON l.id = p.lead_id
        WHERE p.pass_hash = ? AND p.expires_at > ? AND l.erased_at IS NULL`,
    )
    .get(passHash, now);
  if (!row) return null;
  const submittedBy = text(row.submitted_by);
  return {
    passHash: String(row.pass_hash),
    leadId: String(row.lead_id),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    consentVersion: String(row.consent_version),
    submittedBy: submittedBy === "student" || submittedBy === "parent" ? submittedBy : null,
    recordUse: Number(row.record_use) === 1,
  };
}

export function deleteGatePass(db: DatabaseSync, passHash: string): boolean {
  return Number(db.prepare("DELETE FROM crm_gate_passes WHERE pass_hash = ?").run(passHash).changes) > 0;
}

export function deleteGatePassesForLead(db: DatabaseSync, leadId: string): number {
  return Number(db.prepare("DELETE FROM crm_gate_passes WHERE lead_id = ?").run(leadId).changes);
}

export function deleteExpiredGatePasses(db: DatabaseSync, now: number): number {
  return Number(db.prepare("DELETE FROM crm_gate_passes WHERE expires_at <= ?").run(now).changes);
}

/** Keeps a lead's `keep` newest passes (by creation time) and deletes the rest. */
export function trimGatePasses(db: DatabaseSync, leadId: string, keep: number): number {
  return Number(
    db
      .prepare(
        `DELETE FROM crm_gate_passes
          WHERE lead_id = ?
            AND pass_hash NOT IN (
              SELECT pass_hash FROM crm_gate_passes WHERE lead_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
            )`,
      )
      .run(leadId, leadId, keep).changes,
  );
}

export function countGatePasses(db: DatabaseSync, leadId: string): number {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM crm_gate_passes WHERE lead_id = ?").get(leadId)?.n ?? 0);
}
