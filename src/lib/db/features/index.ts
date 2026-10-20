import { schema as ask } from "./ask.ts";
import { schema as crm } from "./crm.ts";
import { schema as mcp } from "./mcp.ts";
import { schema as mocktest } from "./mocktest.ts";
import { schema as planner } from "./planner.ts";
import { schema as predictor } from "./predictor.ts";

/** Feature schemas (M6), applied in this order after the core migrations. Each is idempotent. */
export const FEATURE_SCHEMAS: readonly { name: string; sql: string }[] = [
  { name: "predictor", sql: predictor },
  { name: "mocktest", sql: mocktest },
  { name: "ask", sql: ask },
  { name: "planner", sql: planner },
  { name: "mcp", sql: mcp },
  { name: "crm", sql: crm },
];
