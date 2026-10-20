import type { Messages } from "@/i18n/messages/types";
import {
  CLASS_OPTIONS,
  CONTACT_TOPIC_OPTIONS,
  HERO_CLASS_EXAM_OPTIONS,
  PROGRAM_INTEREST_OPTIONS,
} from "@/lib/contracts/enquiry";
import type { SelectOption, SelectOptionGroup } from "./fields";

/**
 * Localised labels for the contract's select options. Values always come from the contract
 * (they are what the server validates); only the visible labels come from `forms.shared.options`.
 * A value without a translation falls back to the contract's English label.
 */
export type OptionMessages = Messages<"forms">["shared"]["options"];

function label(table: Record<string, string>, value: string, fallback: string): string {
  return Object.hasOwn(table, value) ? table[value] : fallback;
}

export function classOptions(t: OptionMessages): SelectOption[] {
  return CLASS_OPTIONS.map((o) => ({ value: o.value, label: label(t.class, o.value, o.label) }));
}

export function programOptions(t: OptionMessages): SelectOption[] {
  return PROGRAM_INTEREST_OPTIONS.map((o) => ({ value: o.value, label: label(t.program, o.value, o.label) }));
}

export function topicOptions(t: OptionMessages): SelectOption[] {
  return CONTACT_TOPIC_OPTIONS.map((o) => ({ value: o.value, label: label(t.topic, o.value, o.label) }));
}

/** HERO_CLASS_EXAM_OPTIONS grouped by program for <optgroup>s, in contract order, with localised labels. */
export function classExamGroups(t: OptionMessages): SelectOptionGroup[] {
  const groups: { key: string; label: string; options: SelectOption[] }[] = [];
  for (const option of HERO_CLASS_EXAM_OPTIONS) {
    let group = groups.find((g) => g.key === option.programInterest);
    if (!group) {
      group = { key: option.programInterest, label: label(t.classExamGroup, option.programInterest, option.group), options: [] };
      groups.push(group);
    }
    group.options.push({ value: option.value, label: label(t.classExam, option.value, option.label) });
  }
  return groups.map(({ label: groupLabel, options }) => ({ label: groupLabel, options }));
}
