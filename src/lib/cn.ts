/** Joins class names, skipping falsy values. Does not resolve Tailwind conflicts — avoid passing competing utilities. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
