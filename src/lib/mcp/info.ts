import packageJson from "../../../package.json";

/** MCP server identity (initialize → serverInfo). The version follows package.json. */
export const MCP_SERVER_NAME = "aspire-website";
export const MCP_SERVER_TITLE = "Aspire IIT & Medical website";
export const MCP_SERVER_VERSION: string = packageJson.version;

/** Sent to clients in the initialize result; written for the agent. */
export const MCP_SERVER_INSTRUCTIONS = [
  "Admin tools for the Aspire IIT & Medical coaching institute website (Himachal Pradesh, India).",
  "Access is granted per service (site, accounts, progress, audit, content, crm) with separate read and write permissions; tools/list shows only the tools this token may use, and site_status lists its permissions.",
  "Admin accounts cannot be created or changed here, and there is no password reset.",
  "Many students are minors: use personal data only for the admin task at hand, never copy it elsewhere, and keep one-time temporary passwords out of files and logs.",
  "Records marked placeholder: true are unverified DEMO data. Never invent results, ranks, scores, fees or contact details.",
  "CRM leads (crm service) are families' personal data, often of minors: lists mask phone numbers, open a lead only when needed, and nothing is ever sent to a family (log_lead_contact only records what staff did).",
  "Every call is audited.",
].join(" ");
