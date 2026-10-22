import { schema as ask } from "./ask.ts";
import { schema as crm } from "./crm.ts";
import { schema as crmIntake } from "./crm-intake.ts";
import { schema as mcp } from "./mcp.ts";
import { schema as mocktest } from "./mocktest.ts";
import { schema as pageLayout } from "./page-layout.ts";
import { schema as planner } from "./planner.ts";
import { schema as predictor } from "./predictor.ts";
import { schema as qb } from "./qb.ts";
import { schema as superadmin } from "./superadmin.ts";

/** Feature schemas (M6), applied in this order after the core migrations. Each is idempotent. */
export const FEATURE_SCHEMAS: readonly { name: string; sql: string }[] = [
  { name: "predictor", sql: predictor },
  { name: "mocktest", sql: mocktest },
  { name: "ask", sql: ask },
  { name: "planner", sql: planner },
  { name: "mcp", sql: mcp },
  { name: "crm", sql: crm },
  // Lead routing (docs/lead-routing-plan.md §12): after crm, superadmin then crm_intake.
  { name: "superadmin", sql: superadmin },
  { name: "crm_intake", sql: crmIntake },
  // Page layout (docs/page-layout-plan.md §5): before qb, which stays last.
  { name: "page_layout", sql: pageLayout },
  { name: "qb", sql: qb },
];
