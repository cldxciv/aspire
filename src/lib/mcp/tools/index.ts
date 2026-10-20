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
import { CRM_TOOLS } from "./crm";
import { getStudentProgress } from "./progress";
import { siteStatus } from "./status";
import type { AspireTool } from "./types";

/** Every MCP tool. `tools/list` returns the allowed ones in service-catalogue order (src/lib/mcp/scopes.ts). */
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
  ...CRM_TOOLS,
] as unknown as readonly AspireTool[];

export const MCP_TOOL_NAMES: ReadonlySet<string> = new Set(MCP_TOOLS.map((tool) => tool.name));

export type { AspireTool, ToolContext, ToolOutcome } from "./types";
