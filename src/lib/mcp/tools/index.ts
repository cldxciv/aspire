import "server-only";

import {
  createAccount,
  getAccount,
  linkParentStudent,
  listAccounts,
  setAccountDisabled,
  unlinkParentStudent,
} from "./accounts";
import { listAuditLog } from "./audit";
import { listCentres, listPrograms, listResults } from "./content";
import { getStudentProgress } from "./progress";
import { siteStatus } from "./status";
import type { AspireTool } from "./types";

/** Every MCP tool, in the order `tools/list` returns them (reads first). */
export const MCP_TOOLS: readonly AspireTool[] = [
  siteStatus,
  listAccounts,
  getAccount,
  listAuditLog,
  getStudentProgress,
  listPrograms,
  listCentres,
  listResults,
  createAccount,
  linkParentStudent,
  unlinkParentStudent,
  setAccountDisabled,
] as unknown as readonly AspireTool[];

export const MCP_TOOL_NAMES: ReadonlySet<string> = new Set(MCP_TOOLS.map((tool) => tool.name));

export type { AspireTool, ToolContext, ToolOutcome } from "./types";
