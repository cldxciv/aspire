/**
 * Pure step logic for the home hero 3-step enquiry form (HeroEnquiryForm, D-021).
 *
 * Field rules, step membership and messages all come from the contract
 * (`src/lib/contracts/enquiry.ts`); this module only adds display order, labels and
 * routing helpers. Kept free of React so it can be unit-tested (hero-steps.test.ts).
 */

import { format } from "@/i18n/format";
import enForms from "@/i18n/messages/en/forms";
import type { Messages } from "@/i18n/messages/types";
import {
  HERO_CLASS_EXAM_OPTIONS,
  HERO_STEP_FIELDS,
  heroStepOfField,
  type HeroFieldName,
  type HeroStepIndex,
} from "@/lib/contracts/enquiry";

type HeroStepMessages = Messages<"forms">["hero"]["steps"];
export type HeroStepCopy = { title: string; description: string; short: string };

/**
 * Step headings, one-line descriptions and short progress labels in display order
 * (design-details board, D-021a), from the `forms.hero.steps` messages.
 */
export function heroSteps(steps: HeroStepMessages): readonly [HeroStepCopy, HeroStepCopy, HeroStepCopy] {
  return [steps.student, steps.contact, steps.preferences];
}

/** The English steps (tests and defaults). */
export const HERO_STEPS = heroSteps(enForms.hero.steps);

export const HERO_STEP_COUNT = HERO_STEPS.length;
export const LAST_HERO_STEP: HeroStepIndex = 2;

/** Visible step prefix, e.g. "Step 1 of 3" (`template` = `forms.hero.stepLabel`). */
export function heroStepLabel(step: HeroStepIndex, template: string = enForms.hero.stepLabel): string {
  return format(template, { current: step + 1, total: HERO_STEP_COUNT });
}

export function nextHeroStep(step: HeroStepIndex): HeroStepIndex {
  return step >= LAST_HERO_STEP ? LAST_HERO_STEP : ((step + 1) as HeroStepIndex);
}

export function previousHeroStep(step: HeroStepIndex): HeroStepIndex {
  return step <= 0 ? 0 : ((step - 1) as HeroStepIndex);
}

/** Every hero field in display order (step 1 → 3, top to bottom). */
export const HERO_FIELD_ORDER: readonly HeroFieldName[] = HERO_STEP_FIELDS.flat();

/** One message per field (the first one the contract reports). */
export type HeroFieldErrors = Partial<Record<HeroFieldName, string>>;

/**
 * Keeps the first message for each hero field, in display order. Accepts zod's flattened
 * `fieldErrors`, `validateHeroStep()` output or a server 422 `fieldErrors` object. Keys that
 * no step renders ("source", "website", anything unknown) are dropped.
 */
export function pickHeroErrors(fieldErrors: Record<string, readonly string[] | undefined> | null | undefined): HeroFieldErrors {
  const picked: HeroFieldErrors = {};
  if (!fieldErrors) return picked;
  for (const field of HERO_FIELD_ORDER) {
    const message = fieldErrors[field]?.[0];
    if (message) picked[field] = message;
  }
  return picked;
}

/** The first invalid field in display order and the step that renders it (where to jump and what to focus). */
export function firstHeroError(errors: HeroFieldErrors): { field: HeroFieldName; step: HeroStepIndex } | null {
  for (const field of HERO_FIELD_ORDER) {
    if (!errors[field]) continue;
    const step = heroStepOfField(field);
    if (step !== null) return { field, step };
  }
  return null;
}

/** Replaces one step's errors with `stepErrors`, keeping the other steps' errors untouched. */
export function withStepErrors(errors: HeroFieldErrors, step: HeroStepIndex, stepErrors: HeroFieldErrors): HeroFieldErrors {
  const next: HeroFieldErrors = {};
  for (const field of HERO_FIELD_ORDER) {
    const message = heroStepOfField(field) === step ? stepErrors[field] : errors[field];
    if (message) next[field] = message;
  }
  return next;
}

export type ClassExamGroup = { label: string; options: { value: string; label: string }[] };

/**
 * `HERO_CLASS_EXAM_OPTIONS` grouped by `group` for <optgroup>s, keeping contract order, with the
 * contract's English labels. The form renders `classExamGroups(messages)` (option-labels.ts).
 */
export const HERO_CLASS_EXAM_GROUPS: readonly ClassExamGroup[] = HERO_CLASS_EXAM_OPTIONS.reduce<ClassExamGroup[]>(
  (groups, option) => {
    let group = groups.find((g) => g.label === option.group);
    if (!group) {
      group = { label: option.group, options: [] };
      groups.push(group);
    }
    group.options.push({ value: option.value, label: option.label });
    return groups;
  },
  [],
);
