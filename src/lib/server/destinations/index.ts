import "server-only";

import type { EnquiryDestinationConfig } from "../env";
import { noneDestination } from "./none";
import type { EnquiryDestination } from "./types";
import { createWebhookDestination } from "./webhook";

export type { DeliveryResult, EnquiryDestination, EnquiryPayload, ForwardedEnquiry } from "./types";

/** Builds the adapter for a parsed ENQUIRY_DESTINATION config. Add new adapters here. */
export function createDestination(
  config: EnquiryDestinationConfig,
  deps: { fetchImpl?: typeof fetch; webhookTimeoutMs?: number } = {},
): EnquiryDestination {
  switch (config.kind) {
    case "webhook":
      return createWebhookDestination({
        url: config.url,
        secret: config.secret,
        timeoutMs: deps.webhookTimeoutMs,
        fetchImpl: deps.fetchImpl,
      });
    case "none":
      return noneDestination;
  }
}
