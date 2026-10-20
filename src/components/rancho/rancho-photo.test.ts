import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PhotoError } from "@/components/ask/prepare-photo";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { ASK_ENDPOINT, ASK_MAX_IMAGE_BYTES, ASK_MAX_QUESTION_CHARS } from "@/lib/ask/constants";
import { checkImage } from "@/lib/ask/image";
import { askFieldErrors, askRequestSchema, cleanQuestion } from "@/lib/ask/schema";

import { RanchoChatPanel, type RanchoLinks } from "./RanchoChatPanel";
import { RanchoPhotoAttachment } from "./RanchoPhotoAttachment";
import { askRancho, buildAskBody, validateQuestion } from "./rancho-chat";
import {
  createPreviewUrls,
  loadRanchoPhoto,
  photoByteLimit,
  photoFileProblem,
  RANCHO_PHOTO_ACCEPT,
  RANCHO_PHOTO_MAX_FILE_BYTES,
  type RanchoPhoto,
} from "./rancho-photo";

/** Photo questions in the floating Rancho chat: the /api/ask contract, checks, preview, object URLs. */

/** The first 12 bytes of a JPEG (FF D8 FF E0 … "JFIF"), base64: what preparePhoto produces is a JPEG. */
const JPEG_BASE64 = "/9j/4AAQSkZJRgAB";

const photo = (overrides: Partial<RanchoPhoto> = {}): RanchoPhoto => ({
  mediaType: "image/jpeg",
  base64: JPEG_BASE64,
  bytes: 12,
  previewUrl: "blob:http://localhost:3000/photo-1",
  ...overrides,
});

const done = () =>
  new Response(`${JSON.stringify({ t: "done", stop: "end_turn", meta: null })}\n`, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });

/** Sends through askRancho with a mocked fetch (no real request) and returns the parsed JSON body. */
async function sentBody(input: Parameters<typeof askRancho>[0]) {
  const fetchImpl = vi.fn<typeof fetch>(async () => done());
  await askRancho(input, { signal: new AbortController().signal, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe(ASK_ENDPOINT);
  expect(init?.method).toBe("POST");
  expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

/** What the API does with a body before it is answered: schema, cross-field rules, photo check. */
function apiAccepts(body: Record<string, unknown>) {
  const parsed = askRequestSchema.safeParse(body);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  expect(askFieldErrors(parsed.data, cleanQuestion(parsed.data.question))).toBeNull();
  if (parsed.data.image) expect(checkImage(parsed.data.image.mediaType, parsed.data.image.data).ok).toBe(true);
}

describe("request contract with a photo", () => {
  it("photo + text: the trimmed question, the JPEG as base64 and the student's confirmation", async () => {
    const body = await sentBody({ question: "  Why does the block slide?  ", subject: "physics", language: "en", photo: photo(), photoConsent: true });
    expect(body).toEqual({
      question: "Why does the block slide?",
      subject: "physics",
      language: "en",
      image: { mediaType: "image/jpeg", data: JPEG_BASE64 },
      photoConsent: true,
    });
    apiAccepts(body);
    // Only the API's fields: no preview URL, size or file name leaves the device.
    expect(JSON.stringify(body)).not.toMatch(/blob:|previewUrl|bytes/);
  });

  it("photo only: an empty question is allowed, as the API allows it", async () => {
    const body = await sentBody({ question: "   ", subject: "auto", language: "hi", photo: photo(), photoConsent: true });
    expect(body).toEqual({ question: "", subject: "auto", language: "hi", image: { mediaType: "image/jpeg", data: JPEG_BASE64 }, photoConsent: true });
    apiAccepts(body);
  });

  it("a photo without the confirmation is sent as photoConsent: false, which the API refuses", () => {
    const body = buildAskBody({ question: "", subject: "auto", language: "en", photo: photo() });
    expect(body.photoConsent).toBe(false);
    const parsed = askRequestSchema.parse(body);
    expect(askFieldErrors(parsed, "")).toHaveProperty("photoConsent");
  });

  it("text only still sends no image fields", () => {
    expect(buildAskBody({ question: "x", subject: "auto", language: "en", photo: null, photoConsent: true })).toEqual({
      question: "x",
      subject: "auto",
      language: "en",
    });
  });

  it("validates like the API: question or photo, length limit, and the confirmation with a photo", () => {
    expect(validateQuestion("  ")).toBe("required");
    expect(validateQuestion("  ", { consent: true })).toBeNull();
    expect(validateQuestion("", { consent: false })).toBe("consent_required");
    expect(validateQuestion("What is x?", { consent: false })).toBe("consent_required");
    expect(validateQuestion("a".repeat(ASK_MAX_QUESTION_CHARS + 1), { consent: true })).toBe("too_long");
    expect(validateQuestion("What is x?", null)).toBeNull();
  });
});

describe("choosing a photo", () => {
  const file = (type: string, name = "question.jpg") => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type });

  it("accepts any image (camera or gallery) and refuses other files before reading them", () => {
    expect(RANCHO_PHOTO_ACCEPT).toBe("image/*");
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic", "IMAGE/JPEG", ""]) expect(photoFileProblem({ type }), type).toBeNull();
    for (const type of ["application/pdf", "video/mp4", "text/plain"]) expect(photoFileProblem({ type }), type).toBe("unsupported");
  });

  it("uses the size limit from GET /api/ask, never above the shared limit", () => {
    expect(photoByteLimit(null)).toBe(ASK_MAX_IMAGE_BYTES);
    expect(photoByteLimit({ maxImageBytes: 1_000_000 })).toBe(1_000_000);
    expect(photoByteLimit({ maxImageBytes: ASK_MAX_IMAGE_BYTES * 2 })).toBe(ASK_MAX_IMAGE_BYTES);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(photoByteLimit({ maxImageBytes: bad })).toBe(ASK_MAX_IMAGE_BYTES);
  });

  it("prepares the photo with the Ask page's preparePhoto and returns it", async () => {
    const prepare = vi.fn(async () => photo());
    const revoke = vi.fn();
    const result = await loadRanchoPhoto(file("image/jpeg"), { maxBytes: 100, prepare, revoke });
    expect(result).toEqual({ ok: true, photo: photo() });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("reports an unsupported file without preparing it", async () => {
    const prepare = vi.fn(async () => photo());
    expect(await loadRanchoPhoto(file("application/pdf", "notes.pdf"), { maxBytes: 100, prepare })).toEqual({ ok: false, problem: "unsupported" });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("reports a photo that can't be decoded, and one that is still too large after re-encoding", async () => {
    const unreadable = await loadRanchoPhoto(file("image/heic"), {
      maxBytes: 100,
      prepare: async () => {
        throw new PhotoError("unreadable");
      },
    });
    expect(unreadable).toEqual({ ok: false, problem: "unreadable" });
    const broken = await loadRanchoPhoto(file("image/jpeg"), {
      maxBytes: 100,
      prepare: async () => {
        throw new Error("canvas failed");
      },
    });
    expect(broken).toEqual({ ok: false, problem: "unreadable" });
    const tooLarge = await loadRanchoPhoto(file("image/jpeg"), {
      maxBytes: 100,
      prepare: async () => {
        throw new PhotoError("too_large");
      },
    });
    expect(tooLarge).toEqual({ ok: false, problem: "too_large" });
  });

  it("refuses a huge file before decoding it (full-size decode could exhaust a phone's memory)", async () => {
    expect(RANCHO_PHOTO_MAX_FILE_BYTES).toBe(30 * 1024 * 1024);
    expect(RANCHO_PHOTO_MAX_FILE_BYTES).toBeGreaterThan(ASK_MAX_IMAGE_BYTES);
    const prepare = vi.fn(async () => photo());
    const big = new File([new Uint8Array(11)], "panorama.jpg", { type: "image/jpeg" });
    expect(await loadRanchoPhoto(big, { maxBytes: 100, maxFileBytes: 10, prepare })).toEqual({ ok: false, problem: "too_large" });
    expect(prepare).not.toHaveBeenCalled();
    const fits = new File([new Uint8Array(10)], "question.jpg", { type: "image/jpeg" });
    expect(await loadRanchoPhoto(fits, { maxBytes: 100, maxFileBytes: 10, prepare })).toEqual({ ok: true, photo: photo() });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("refuses a prepared photo over the server's limit and revokes its preview URL at once", async () => {
    const revoke = vi.fn();
    const big = photo({ bytes: 2_000_001, previewUrl: "blob:http://localhost:3000/big" });
    const result = await loadRanchoPhoto(file("image/jpeg"), { maxBytes: 2_000_000, prepare: async () => big, revoke });
    expect(result).toEqual({ ok: false, problem: "too_large" });
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:http://localhost:3000/big");
  });
});

describe("preview object URLs", () => {
  it("revokes a URL when its last holder lets go, and everything on New chat / unmount", () => {
    const revoke = vi.fn();
    const urls = createPreviewUrls(revoke);

    // Attach A, then replace it with B: A is revoked.
    urls.hold("blob:a");
    urls.hold("blob:b");
    urls.release("blob:a");
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:a");

    // Send B: the message holds it, the composer lets go; still alive for the message.
    urls.hold("blob:b");
    urls.release("blob:b");
    expect(revoke).toHaveBeenCalledTimes(1);

    // Given back after a failure (composer + message), then removed from the composer: still alive.
    urls.hold("blob:b");
    urls.release("blob:b");
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(urls.size).toBe(1);

    // Releasing twice or an unknown URL does nothing.
    urls.release("blob:a");
    urls.release("blob:unknown");
    urls.release(null);
    expect(revoke).toHaveBeenCalledTimes(1);

    // New chat / unmount: everything left is revoked, once.
    urls.hold("blob:c");
    urls.releaseAll();
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(["blob:a", "blob:b", "blob:c"]);
    expect(urls.size).toBe(0);
    urls.releaseAll();
    expect(revoke).toHaveBeenCalledTimes(3);
  });
});

describe("RanchoPhotoAttachment (preview + remove)", () => {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
  const ids = { consent: "c", consentError: "c-error", note: "c-note" };

  function props(locale: Locale, overrides: Partial<Parameters<typeof RanchoPhotoAttachment>[0]> = {}) {
    return {
      previewUrl: "blob:http://localhost:3000/photo-1",
      consent: false,
      onConsentChange: vi.fn(),
      onRemove: vi.fn(),
      consentError: null,
      ids,
      messages: messagesFor(locale, "rancho").panel.photo,
      ...overrides,
    };
  }

  function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as ReactNode)];
  }

  it.each(["en", "hi"] as const)("shows the local preview with alt text, the confirmation, the note and a remove button (%s)", (locale) => {
    const t = messagesFor(locale, "rancho").panel.photo;
    const html = renderToStaticMarkup(createElement(RanchoPhotoAttachment, props(locale)));
    expect(html).toMatch(new RegExp(`<img src="blob:http://localhost:3000/photo-1" alt="${escape(t.previewAlt)}"`));
    expect(html).toContain(`<span class="sr-only">${escape(t.remove)}</span>`);
    expect(html).toMatch(/<button type="button"[^>]*title="[^"]+"/);
    expect(html).toMatch(/<label for="c"[^>]*>.*<input[^>]*id="c" type="checkbox"[^>]*aria-describedby="c-note"/);
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(html).toContain(escape(t.consent));
    expect(html).toContain(`<p id="c-note"`);
    expect(html).toContain(escape(t.note));
    expect(html).not.toContain("aria-invalid");
  });

  it("marks the checkbox when the student sends without ticking it", () => {
    const t = messagesFor("en", "rancho").panel.photo;
    const html = renderToStaticMarkup(createElement(RanchoPhotoAttachment, props("en", { consent: false, consentError: t.errors.consentRequired })));
    expect(html).toMatch(/type="checkbox"[^>]*aria-invalid="true"[^>]*aria-describedby="c-error c-note"/);
    expect(html).toContain(`<p id="c-error" class="mt-1 text-xs font-semibold text-danger">${escape(t.errors.consentRequired)}</p>`);
  });

  it("wires remove and the checkbox to the panel", () => {
    const p = props("en");
    const tree = elements(RanchoPhotoAttachment(p));
    const remove = tree.find((el) => el.type === "button");
    (remove?.props.onClick as () => void)();
    expect(p.onRemove).toHaveBeenCalledTimes(1);
    const checkbox = tree.find((el) => el.type === "input" && el.props.type === "checkbox");
    (checkbox?.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    expect(p.onConsentChange).toHaveBeenCalledWith(true);
  });
});

describe("RanchoChatPanel composer", () => {
  const links = (locale: Locale): RanchoLinks => ({
    ask: locale === "hi" ? "/hi/tools/ask" : "/tools/ask",
    enquiry: "/admissions#enquiry",
    privacy: "/privacy",
    signIn: "/login",
  });
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

  it.each(["en", "hi"] as const)("has a camera button in the composer row and an image input that offers camera or gallery (%s)", (locale) => {
    const t = messagesFor(locale, "rancho").panel;
    const html = renderToStaticMarkup(
      createElement(RanchoChatPanel, { id: "rancho-panel", open: false, onClose: () => {}, messages: t, locale, links: links(locale) }),
    );
    // Camera button (accessible name "Add a photo"), first in the composer row, before the field and Send.
    const row = html.slice(html.indexOf('<div class="flex items-end gap-2">'));
    expect(row).toMatch(
      new RegExp(
        `^<div class="flex items-end gap-2"><div class="[^"]*"><button type="button" title="${escape(t.photo.add)}"[^>]*>.*?<span class="sr-only">${escape(t.photo.add)}</span></button><textarea`,
      ),
    );
    expect(row.indexOf("<textarea")).toBeLessThan(row.indexOf('<button type="submit"'));
    // One hidden file input: any image, no `capture` (so phones offer the camera and the gallery).
    expect(html.match(/type="file"/g)).toHaveLength(1);
    const input = html.match(/<input type="file"[^>]*>/)?.[0] ?? "";
    expect(input).toContain('accept="image/*"');
    expect(input).toMatch(/\shidden=""/);
    expect(input).toContain('tabindex="-1"');
    expect(input).not.toContain("capture");
    // No photo yet: no preview, no confirmation box.
    expect(html).not.toContain("data-rancho-photo");
    expect(html).not.toContain('type="checkbox"');
    // The full page stays one tap away: the expand icon in the header (a 44px target, named by its text).
    const fullPage = html.match(new RegExp(`<a [^>]*>(?:(?!</a>).)*<span class="sr-only">${escape(t.fullPageLink)}</span></a>`))?.[0] ?? "";
    expect(fullPage).toContain(`href="${links(locale).ask}"`);
    expect(fullPage).toContain("size-11");
    // Send is a round icon button, only aria-disabled while a photo is being prepared.
    expect(html).toMatch(new RegExp(`<button type="submit" title="${escape(t.send)}" class="[^"]*rounded-full`));
    expect(html).not.toMatch(/<button type="submit"[^>]*\saria-disabled="/);
  });

  it("clears the chat, frees the photos and closes the dialog when the panel is hidden or unmounted", () => {
    // Next's <Activity> (cacheComponents) hides a left route and runs its effect cleanups but keeps
    // its state, so the cleanup must not leave messages pointing at revoked object URLs, a turn
    // waiting for an aborted answer, or an open modal dialog that keeps the next page inert.
    const source = readFileSync(fileURLToPath(new URL("./RanchoChat.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
    const block = source.match(/useEffect\(\(\) => \{\n\s*mountedRef\.current = true;[\s\S]*?\n {2}\}, \[previewUrls\]\);/)?.[0] ?? "";
    expect(block).not.toBe("");
    const cleanup = block.slice(block.indexOf("return () => {"));
    for (const step of [
      "mountedRef.current = false",
      ".abort()",
      "dialog.close()",
      "pickRef.current += 1",
      "chatRef.current += 1",
      "previewUrls.releaseAll()",
      "setPhoto(null)",
      "setTurns([])",
    ]) {
      expect(cleanup, step).toContain(step);
    }
    // A handoff's prefill survives React's dev double-mount: the draft is not cleared here.
    expect(cleanup).not.toContain('setQuestion("")');
    expect(cleanup).not.toContain("setToolContext(null)");
  });
});

describe("photo copy", () => {
  it("names faces, names and on-device location removal in both languages", () => {
    const en = messagesFor("en", "rancho").panel.photo;
    expect(en.add).toBe("Add a photo");
    expect(en.note).toMatch(/faces/);
    expect(en.note).toMatch(/names/);
    expect(en.note).toMatch(/[Ll]ocation.*on your device/);
    expect(en.note).toMatch(/isn't stored/);
    expect(messagesFor("en", "rancho").panel.privacy).toMatch(/photo/);

    const hi = messagesFor("hi", "rancho").panel.photo;
    expect(hi.add).toMatch(/फ़ोटो/);
    expect(hi.note).toMatch(/चेहरे/);
    expect(hi.note).toMatch(/नाम/);
    expect(hi.note).toMatch(/लोकेशन/);
    expect(hi.note).toMatch(/डिवाइस/);
    expect(messagesFor("hi", "rancho").panel.privacy).toMatch(/फ़ोटो/);
  });

  it("the 'photo added' announcement points to the required box, and Send while preparing says why (en + hi)", () => {
    const en = messagesFor("en", "rancho").panel.photo;
    expect(en.attachedAnnouncement.startsWith(en.attached)).toBe(true);
    expect(en.attachedAnnouncement).toMatch(/[Tt]ick the box/);
    expect(en.wait).toMatch(/still being prepared/);
    const hi = messagesFor("hi", "rancho").panel.photo;
    expect(hi.attachedAnnouncement.startsWith(hi.attached)).toBe(true);
    expect(hi.attachedAnnouncement).toMatch(/बॉक्स पर टिक/);
    expect(hi.wait).toMatch(/तैयार हो रही/);
  });
});
