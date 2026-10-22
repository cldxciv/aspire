/**
 * Page hero kit (2026-10-22 redesign of the inner-page heroes). See ./README.md for the API and
 * which page uses which pieces. Server components unless marked "client island".
 */
export { HeroAction, isInternalHref } from "./HeroAction";
export { HeroBreadcrumbs, type Crumb } from "./HeroBreadcrumbs";
export { HeroCollage, type CollagePhoto, type CollageResult } from "./HeroCollage";
export {
  HeroCopy,
  HeroFrame,
  HeroHeadline,
  HeroPanel,
  type EyebrowStyle,
  type HeroArt,
  type HeroCopyProps,
  type HeroFrameProps,
  type HighlightStyle,
} from "./HeroFrame";
export { HeroProgramCard } from "./HeroProgramCard";
export { HeroRidgeArt } from "./HeroRidgeArt";
export { HeroFactsStrip, ProofStats, type HeroFact, type ProofStat } from "./HeroStats";
export { NextBatchCard, type HeroLink, type NextBatchRow } from "./NextBatchCard";
export { RanchoChip } from "./RanchoChip";
export { CentreMap } from "./CentreMap";
/** Client islands. */
export { CentreFinder, type FinderAction, type FinderLabels } from "./CentreFinder";
export { ProgramPicker, type PickerLabels } from "./ProgramPicker";
export { ResultsRibbon, type RibbonCard, type RibbonLabels } from "./ResultsRibbon";
/** Pure helpers (server-side view models). */
export {
  HP_DISTRICTS,
  districtName,
  findDistrict,
  isDistrict,
  type DistrictId,
  type HpDistrict,
} from "./districts";
export {
  centreForDistrict,
  centrePoint,
  defaultDistrictId,
  finderCentres,
  finderDistricts,
  type FinderCentre,
  type FinderDistrict,
} from "./finder-data";
export { isFilled, splitHighlight } from "./hero-text";
export {
  defaultProgramSlug,
  pickerProgram,
  programHeroFacts,
  type PickerFactLabels,
  type PickerProgram,
} from "./program-picker-data";
export { cardsForYear, pickRibbonCards, ribbonYears, type RibbonYear } from "./ribbon-data";
export { HERO_ACTION, HERO_GRID, type HeroActionVariant, type HeroAsideAlign, type HeroLayout } from "./hero-styles";
