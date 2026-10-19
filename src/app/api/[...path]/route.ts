import { notFoundResponse } from "@/lib/server/http";

/**
 * Catch-all for unknown /api/* paths so every API response uses the JSON
 * envelope (D-007) instead of the HTML 404 page. Specific routes take precedence.
 */
function unknownEndpoint(): Response {
  return notFoundResponse("This API endpoint does not exist.");
}

export const GET = unknownEndpoint;
export const POST = unknownEndpoint;
export const PUT = unknownEndpoint;
export const PATCH = unknownEndpoint;
export const DELETE = unknownEndpoint;
