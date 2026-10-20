import packageJson from "../../../package.json";

/** MCP server identity (initialize → serverInfo). The version follows package.json. */
export const MCP_SERVER_NAME = "aspire-website";
export const MCP_SERVER_TITLE = "Aspire IIT & Medical website";
export const MCP_SERVER_VERSION: string = packageJson.version;

/** Sent to clients in the initialize result; written for the agent. */
export const MCP_SERVER_INSTRUCTIONS = [
  "Admin tools for the Aspire IIT & Medical coaching institute website (Himachal Pradesh, India).",
  "Read tools: list_accounts, get_account, list_audit_log, get_student_progress, list_programs, list_centres, list_results, site_status.",
  "Write tools (need a 'read write' token): create_account, link_parent_student, unlink_parent_student, set_account_disabled. Admin accounts cannot be created or changed here, and there is no password reset.",
  "Many students are minors: use personal data only for the admin task at hand, never copy it elsewhere, and keep one-time temporary passwords out of files and logs.",
  "Records marked placeholder: true are unverified DEMO data. Never invent results, ranks, scores, fees or contact details.",
  "The website does not store enquiries; see site_status for where they go. Every call is audited.",
].join(" ");
