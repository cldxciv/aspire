import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import mcpEn from "@/i18n/messages/en/mcp";
import mcpHi from "@/i18n/messages/hi/mcp";
import { MCP_SERVICES } from "../scopes";
import { MCP_TOOLS } from "./index";

// Admin console 1b §5.L / §11: wording only. "Ask Aspire" is "Rancho (the AI doubt solver)" in the
// MCP tool descriptions; the admin page says "AI assistant access"; no tool, service or scope added.

describe("MCP wording", () => {
  it("no tool title or description says 'Ask Aspire'; site status and progress name Rancho", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.title ?? "", tool.name).not.toContain("Ask Aspire");
      expect(tool.description ?? "", tool.name).not.toContain("Ask Aspire");
    }
    const byName = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));
    expect(byName.get("site_status")?.description).toContain("Rancho (the AI doubt solver)");
    expect(byName.get("get_student_progress")?.description).toContain("Rancho (the AI doubt solver)");
  });

  it("the status and progress tools' summaries say Rancho too, and their data keys are unchanged", () => {
    for (const file of ["status.ts", "progress.ts"]) {
      const source = readFileSync(join(__dirname, file), "utf8");
      expect(source, file).not.toContain("Ask Aspire");
      expect(source, file).toContain("Rancho (the AI doubt solver)");
    }
    // Data keys clients may already read stay as they were.
    expect(readFileSync(join(__dirname, "status.ts"), "utf8")).toContain("askAspire: { configured: ask.configured, model: ask.model }");
    expect(readFileSync(join(__dirname, "progress.ts"), "utf8")).toContain("askWeakTopics: weakTopics");
  });

  it("no tools or services were added: the catalogue is the same 23 tools in 6 services", () => {
    expect(MCP_SERVICES.map((service) => service.id)).toEqual(["site", "accounts", "progress", "audit", "content", "crm"]);
    const tools = MCP_SERVICES.flatMap((service) => [...service.tools.read, ...service.tools.write]);
    expect(tools).toHaveLength(23);
    expect(new Set(MCP_TOOLS.map((tool) => tool.name))).toEqual(new Set(tools));
  });

  it("the admin page reads 'AI assistant access' with plain service names, in English and Hindi", () => {
    expect(mcpEn.page.title).toBe("AI assistant access");
    expect(mcpEn.meta.title).toBe("AI assistant access");
    expect(mcpEn.nav.label).toBe("AI assistant access");
    expect(mcpEn.page.lead).toBe(
      "Let an AI assistant such as Claude look things up or add notes for you. You choose what it may see or change, service by service.",
    );
    expect(Object.values(mcpEn.services).map((service) => service.name)).toEqual([
      "Site status",
      "Accounts",
      "Student progress",
      "Activity log",
      "Website content",
      "Enquiries (admissions)",
    ]);
    expect(mcpHi.page.title).toBe("AI असिस्टेंट एक्सेस");
    expect(mcpHi.nav.label).toBe("AI असिस्टेंट एक्सेस");
    const all = (value: unknown): string[] =>
      typeof value === "string" ? [value] : typeof value === "object" && value !== null ? Object.values(value).flatMap(all) : [];
    for (const text of all(mcpEn)) expect(text).not.toMatch(/\bagents?\b|Ask Aspire/i);
    for (const text of all(mcpHi)) expect(text).not.toMatch(/एजेंट|Ask Aspire/);
  });

  it("mcp messages: Hindi has exactly the English shape", () => {
    const shape = (value: unknown): unknown =>
      typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)])) : typeof value;
    expect(shape(mcpHi)).toEqual(shape(mcpEn));
  });
});
