import { Fragment, type ReactNode } from "react";

/**
 * `format()` for messages that embed elements: fills `{name}` placeholders with React nodes
 * (links, <strong>, icons), so translators can move the element anywhere in the sentence.
 * `formatNodes("Read the {link}.", { link: <Link …>privacy notice</Link> })`.
 * Unknown placeholders stay visible as written. Pure and client-safe.
 */
export function formatNodes(template: string, values: Readonly<Record<string, ReactNode>>): ReactNode {
  const parts = template.split(/(\{\w+\})/g);
  return parts.map((part, index) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    const node = key !== undefined && Object.hasOwn(values, key) ? values[key] : part;
    return node === "" ? null : <Fragment key={index}>{node}</Fragment>;
  });
}
