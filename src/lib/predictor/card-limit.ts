import "server-only";

import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";

/**
 * GET /api/predictor/card renders a fresh PNG on every request (satori + resvg: CPU-heavy) and any
 * extra query parameter defeats HTTP caches, so it is capped per client IP (QA-SEC-M6). Generous
 * enough for a classroom behind one IP moving the what-if slider and for link-preview crawlers;
 * it stops one client from pinning the server's CPU. In-memory, single instance (see rate-limit.ts).
 */
export const PREDICTOR_CARD_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const;

export const predictorCardLimiter = new SlidingWindowRateLimiter({ ...PREDICTOR_CARD_RATE_LIMIT, maxKeys: 5_000 });
