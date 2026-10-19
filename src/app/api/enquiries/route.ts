import { handleEnquiryPost } from "@/lib/server/enquiry-handler";

/**
 * POST /api/enquiries — see docs/api.md.
 * Origin check, JSON + 10 KB limit, per-IP rate limit, zod validation,
 * honeypot, then the destination selected by ENQUIRY_DESTINATION.
 * Other methods get Next.js's automatic 405 (OPTIONS is answered with `Allow`
 * only — no CORS headers are ever sent, so cross-origin browsers are refused).
 */
export async function POST(request: Request): Promise<Response> {
  return handleEnquiryPost(request);
}
