import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { messagesFor } from "@/i18n/messages";
import { movableKeys, PAGE_LAYOUT_PREVIEW_PATH, type LayoutPageKey } from "@/lib/page-layout/registry";
import { defaultEntries } from "@/lib/page-layout/resolve";
import type { PageLayoutStateView } from "@/lib/page-layout/types";

import { defaultStateViews, moveEntries, toggleEntries } from "./editor-model";
import { PageLayoutEditor, type PageLayoutEditorProps } from "./PageLayoutEditor";

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function render(props: Partial<PageLayoutEditorProps> & { locale: "en" | "hi" }): string {
  return renderToStaticMarkup(
    createElement(PageLayoutEditor, {
      canEdit: true,
      states: defaultStateViews(),
      initialPage: "home" as LayoutPageKey,
      t: messagesFor(props.locale, "layout"),
      ...props,
    }),
  );
}

/** Every aria-describedby / aria-labelledby id points at an element on the page. */
function expectTargets(html: string) {
  for (const match of html.matchAll(/aria-(?:describedby|labelledby)="([^"]+)"/g)) {
    for (const id of match[1].split(" ")) expect(html, id).toContain(`id="${id}"`);
  }
}

/** A page with a published custom order, a draft and history. */
function customHome(): Record<LayoutPageKey, PageLayoutStateView> {
  const states = defaultStateViews();
  const base = defaultEntries("home");
  const moved = moveEntries(base, base.findIndex((entry) => entry.key === "tools"), "down");
  const hidden = toggleEntries(moved, moved.findIndex((entry) => entry.key === "voices"));
  states.home = {
    page: "home",
    revision: 3,
    published: { sections: moved, custom: true, updatedAt: Date.UTC(2026, 9, 22, 10, 35), updatedBy: "Anu" },
    draft: { sections: hidden, updatedAt: Date.UTC(2026, 9, 22, 11, 0), updatedBy: null },
    history: [
      { id: 3, action: "save_draft", actor: null, at: Date.UTC(2026, 9, 22, 11, 0), before: moved, after: hidden },
      { id: 2, action: "publish", actor: "Anu", at: Date.UTC(2026, 9, 22, 10, 35), before: base, after: moved },
      { id: 1, action: "save_draft", actor: "Anu", at: Date.UTC(2026, 9, 22, 10, 30), before: base, after: moved },
    ],
  };
  return states;
}

describe.each(["en", "hi"] as const)("page layout editor (%s)", (locale) => {
  const t = messagesFor(locale, "layout");

  it("labels, the picker and every section of the page in order", () => {
    const html = render({ locale });
    expectTargets(html);
    expect(html).toContain(esc(t.list.heading));
    expect(html).toContain(esc(t.picker.label));
    expect(html).toContain(esc(t.picker.hint));
    expect(html).toContain(esc(t.row.fixedFirst));
    expect(html).toContain(esc(t.row.fixedLast));
    expect(html).toContain(esc(t.history.empty));
    expect(html).toContain(esc(t.status.liveDefault));
    expect(html).toContain(esc(t.status.noDraft));
    const sections = t.pages.home.sections as Record<string, { label: string }>;
    const list = html.slice(html.indexOf("<ol "), html.indexOf("</ol>"));
    const order = ["hero", ...movableKeys("home"), "cta"].map((key) => list.indexOf(`>${esc(sections[key].label)}<`));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The picker lists all 10 pages.
    expect(html.match(/<option /g)).toHaveLength(10);
  });

  it("blocked controls use aria-disabled with a linked reason, never disabled", () => {
    const html = render({ locale });
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
    // Top row's "Move up" and bottom row's "Move down" are blocked; their reasons are sr-only.
    expect(html).toContain(esc(t.reasons.atTop));
    expect(html).toContain(esc(t.reasons.atBottom));
    // Nothing to save, no draft to preview or publish, nothing to reset.
    for (const reason of [t.actions.saveNothing, t.actions.previewNoDraft, t.actions.publishNeedsDraft, t.actions.resetNothing]) {
      const id = new RegExp(`id="([^"]+)"[^>]*>${esc(reason).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`).exec(html)?.[1];
      expect(id, reason).toBeTruthy();
      expect(html).toMatch(new RegExp(`aria-disabled="true" aria-describedby="${id}"`));
    }
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("the show checkbox is labelled 'Show on page' plus the section name", () => {
    const html = render({ locale, initialPage: "admissions" });
    const label = esc(t.pages.admissions.sections.results.label);
    expect(html).toContain(`<span>${esc(t.row.show)}</span><span class="sr-only">(${label})</span>`);
    // A keep section's checkbox is blocked with its visible reason.
    expect(html).toContain(esc(t.keep.linked));
    expect(html).toMatch(/type="checkbox"[^>]*aria-disabled="true"[^>]*checked=""/);
  });

  it("the preview form opens the draft in a new tab", () => {
    const html = render({ locale, states: customHome() });
    const form = /<form[^>]*>[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
    expect(form).toContain(`action="${PAGE_LAYOUT_PREVIEW_PATH}"`);
    expect(form).toContain('method="post"');
    expect(form).toContain('target="_blank"');
    expect(form).toContain('<input type="hidden" name="page" value="home"/>');
    expect(form).toContain(`<input type="hidden" name="lang" value="${locale}"/>`);
    // With a saved draft, preview and publish are available.
    expect(form).not.toContain('aria-disabled="true"');
    expect(html).not.toContain(esc(t.actions.publishNeedsDraft));
    expect(html).toContain(esc(t.actions.discard));
  });

  it("status lines and the history list", () => {
    const html = render({ locale, states: customHome() });
    expectTargets(html);
    expect(html).toContain(esc(t.history.heading));
    expect(html.match(/<time /g)).toHaveLength(3);
    expect(html).toContain(esc(`${t.history.someone}`));
    expect(html).toContain(esc(t.pages.home.sections.voices.label));
    // The draft's hidden section shows the Hidden badge.
    expect(html).toContain(esc(t.row.hidden));
    expect(html).toContain("Anu");
    expect(html).toContain(`— ${t.picker.draft}`);
  });

  it("read-only: no move, show or action controls", () => {
    const html = render({ locale, canEdit: false, states: customHome() });
    expectTargets(html);
    expect(html).toContain(esc(t.readOnly.title));
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain(esc(t.row.show));
    expect(html).not.toContain("<form");
    expect(html).not.toContain(esc(t.actions.save));
    expect(html).not.toContain(esc(t.actions.reset));
    expect(html).not.toMatch(/<button/);
    // The live order (not the draft): voices is not hidden there.
    expect(html).not.toContain(esc(t.row.hidden));
  });

  it("data-free preview of the console shows the preview notice", () => {
    const html = render({ locale, canEdit: false, previewAccess: true });
    expect(html).toContain(esc(t.previewAccess));
    expect(html).not.toContain(esc(t.readOnly.title));
  });
});
