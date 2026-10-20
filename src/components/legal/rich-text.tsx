import { Fragment, type ReactNode } from "react";

/**
 * Like `format()` from `@/i18n/format`, but the values may be React nodes (links, badges,
 * `<time>`), so a translated sentence can keep its own word order around them:
 * `richText("Published {date}", { date: <time …/> })`.
 * Unknown placeholders stay visible as written. Server- and client-safe.
 */
export function richText(template: string, values: Readonly<Record<string, ReactNode>>): ReactNode {
  const parts = template.split(/(\{\w+\})/g);
  return parts.map((part, index) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    const value = key !== undefined && Object.hasOwn(values, key) ? values[key] : part;
    return <Fragment key={index}>{value}</Fragment>;
  });
}
