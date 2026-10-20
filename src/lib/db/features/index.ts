import { schema as ask } from "./ask";
import { schema as crm } from "./crm";
import { schema as mcp } from "./mcp";
import { schema as mocktest } from "./mocktest";
import { schema as planner } from "./planner";
import { schema as predictor } from "./predictor";

/** Feature schemas (M6), applied in this order after the core migrations. Each is idempotent. */
export const FEATURE_SCHEMAS: readonly { name: string; sql: string }[] = [
  { name: "predictor", sql: predictor },
  { name: "mocktest", sql: mocktest },
  { name: "ask", sql: ask },
  { name: "planner", sql: planner },
  { name: "mcp", sql: mcp },
  { name: "crm", sql: crm },
];
