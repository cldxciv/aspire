/**
 * Fills `{name}` placeholders in a message: `format("Aspire on {platform}", { platform: "YouTube" })`.
 * Unknown placeholders are left as written so a missing value is visible, never silently blank.
 * Client-safe.
 */
export function format(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
