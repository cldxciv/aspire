import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CounsellorCta } from "@/components/planner/PlannerApp";
import { ResultBody } from "@/components/predictor/PredictorApp";
import { predictorTables } from "@/content/predictor";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { CONSENT_VERSION } from "@/lib/contracts/enquiry";
import { matchColleges, scoreTableFor, selectVisibleData } from "@/lib/predictor/engine";

import { EnquiryForm, type EnquiryFormVariant } from "./EnquiryForm";
import { waitText } from "./FormStatus";
import { HeroEnquiryForm } from "./HeroEnquiryForm";

/** D-039 in the rendered UI: the consent line + its version, and the tools' "Talk to a counsellor" links. */

function inLocale(locale: Locale, element: ReturnType<typeof createElement>): string {
  const Provider = LocaleProvider as FunctionComponent<{ locale: Locale; children?: ReactNode }>;
  return renderToStaticMarkup(createElement(Provider, { locale }, element));
}

/** Text as renderToStaticMarkup escapes it. */
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const HIDDEN_VERSION = `<input type="hidden" name="consentVersion" value="${CONSENT_VERSION}"/>`;

describe("consent line (D-039)", () => {
  it.each(["en", "hi"] as const)("%s: every enquiry form shows the parent/guardian consent line and sends its version", (locale) => {
    const t = messagesFor(locale, "forms");
    const [before, after] = t.shared.consent.split("{link}");
    const forms: [string, ReturnType<typeof createElement>][] = [
      ...(["admissions", "contact"] as EnquiryFormVariant[]).map(
        (variant) => [variant, createElement(EnquiryForm, { variant, messages: t, centreOptions: [] })] as [string, ReturnType<typeof createElement>],
      ),
      ["hero", createElement(HeroEnquiryForm, { centreOptions: [], deliveryStatus: "connected", messages: t })],
    ];
    for (const [name, element] of forms) {
      const html = inLocale(locale, element);
      expect(html, name).toContain(esc(before));
      expect(html, name).toContain(esc(after));
      expect(html, name).toContain(HIDDEN_VERSION);
      expect(html.split('name="consentVersion"'), name).toHaveLength(2);
    }
  });

  it("the hero form keeps the consent line on step 3 (step 1 unchanged: no consent, no extra fields)", () => {
    const t = messagesFor("en", "forms");
    const html = inLocale("en", createElement(HeroEnquiryForm, { centreOptions: [], deliveryStatus: "connected", messages: t }));
    const fieldsets = html.split("<fieldset").slice(1);
    expect(fieldsets).toHaveLength(3);
    expect(fieldsets[0]).not.toContain('name="consent"');
    expect(fieldsets[0].match(/<(input|select|textarea)\b/g)).toHaveLength(2); // student name + class / exam
    expect(fieldsets[2]).toContain('name="consent"');
    expect(fieldsets[2]).toContain(HIDDEN_VERSION);
  });

  it("the received message says Aspire will contact them; long waits read in hours", () => {
    for (const locale of ["en", "hi"] as const) {
      const t = messagesFor(locale, "forms").shared;
      expect(t.status.receivedBody).toContain("{reference}");
      expect(waitText(t.wait, 23 * 3600)).toBe(format(t.wait.hours, { count: 23 }));
      expect(waitText(t.wait, 600)).toBe(format(t.wait.minutes, { count: 10 }));
    }
    expect(messagesFor("en", "forms").shared.status.receivedBody).toMatch(/will contact you/);
  });
});

describe("tool CTAs → enquiry form with ?from= (D-039)", () => {
  function predictorResult() {
    const data = selectVisibleData(predictorTables, true);
    const result = matchColleges({ exam: "jee-main", mode: "score", value: 187 }, data);
    if (result.status !== "ok") throw new Error("expected a prediction");
    return { result, table: scoreTableFor("jee-main", data) };
  }

  it.each(["en", "hi"] as const)("%s: the predictor's counsellor link carries exam + score band only", (locale) => {
    const { result, table } = predictorResult();
    const t = messagesFor(locale, "predictor");
    const html = inLocale(locale, createElement(ResultBody, { result, messages: t, sample: true, table }));
    const prefix = locale === "hi" ? "/hi" : "";
    expect(html).toContain(`href="${prefix}/admissions?from=predictor&amp;exam=jee-main&amp;band=score-180-189#enquiry"`);
    expect(html).toContain(esc(t.result.ctaButton));
    // Never the exact score, category, state or gender.
    expect(html).not.toMatch(/admissions\?[^"]*(187|category|state|gender)/);
  });

  it.each(["en", "hi"] as const)("%s: the planner's counsellor link", (locale) => {
    const t = messagesFor(locale, "planner");
    const html = inLocale(locale, createElement(CounsellorCta, { t, locale }));
    expect(html).toContain(`href="${locale === "hi" ? "/hi" : ""}/admissions?from=planner#enquiry"`);
    expect(html).toContain(esc(t.counsellor.cta));
  });

  it("mock-test results and Ask Aspire use the shared helpers (client-only views)", () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), "src/components", file), "utf8");
    expect(read("mocktest/ResultView.tsx")).toContain('toolEnquiryHref("mock-test", locale)');
    const ask = read("ask/AskAspire.tsx");
    expect(ask.match(/withEnquiryTool\(links\.enquiry, "ask"\)/g)).toHaveLength(2);
    expect(ask).not.toMatch(/href=\{links\.enquiry\}/);
  });

  it("CTA labels exist in both languages", () => {
    for (const locale of ["en", "hi"] as const) {
      expect(messagesFor(locale, "mocktest").result.counsellor.trim()).not.toBe("");
      expect(messagesFor(locale, "ask").stuck.cta.trim()).not.toBe("");
      expect(messagesFor(locale, "planner").counsellor.cta.trim()).not.toBe("");
    }
    expect(messagesFor("en", "predictor").result.ctaButton).toBe("Talk to a counsellor");
  });
});
