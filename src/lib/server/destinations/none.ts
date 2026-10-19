import "server-only";

import type { EnquiryDestination } from "./types";

/** Default destination: nothing is sent or stored. The API answers `not_configured`. */
export const noneDestination: EnquiryDestination = {
  kind: "none",
  async deliver() {
    return { status: "not_configured" };
  },
};
