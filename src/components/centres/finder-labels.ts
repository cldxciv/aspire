import type { FinderLabels } from "@/components/hero/CentreFinder";
import type { Messages } from "@/i18n/messages/types";

/**
 * Strings of the hero's centre finder (`CentreFinder`, E) on /centres and /contact, in the page
 * locale: `centres.finder`, the centre card's Head campus / Call / Directions and `common.labels`.
 */
export function finderLabels(t: Messages<"centres">, common: Messages<"common">): FinderLabels {
  return {
    district: t.finder.district,
    centreFor: t.finder.centreFor,
    mapLabel: t.finder.mapLabel,
    mapNote: t.finder.mapNote,
    headCampus: t.card.headCampus,
    page: t.finder.page,
    call: t.card.call,
    whatsapp: t.finder.whatsapp,
    directions: t.card.directions,
    opensInNewTab: common.labels.opensInNewTab,
    demo: common.labels.demo,
    listTitle: t.finder.listTitle,
  };
}
