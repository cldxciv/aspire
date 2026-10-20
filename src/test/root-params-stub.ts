/**
 * Test stand-in for `next/root-params` (aliased in vitest.config.ts). The real module is
 * replaced by the Next compiler and throws when imported in plain Node.
 *
 * `lang()` resolves to "en" unless a test switches it:
 *
 *   import { setTestLang } from "@/test/root-params-stub";
 *   beforeEach(() => setTestLang("hi"));
 *   afterEach(() => setTestLang("en"));
 *
 * Or per call: `await withTestLang("hi", () => SiteFooter())`.
 */
let current = "en";

export async function lang(): Promise<string> {
  return current;
}

/** Sets the value `lang()` resolves to (any string, so tests can also try unsupported values). */
export function setTestLang(value: string): void {
  current = value;
}

/** Runs `fn` with `lang()` set to `value`, then restores the previous value. */
export async function withTestLang<T>(value: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = current;
  current = value;
  try {
    return await fn();
  } finally {
    current = previous;
  }
}
