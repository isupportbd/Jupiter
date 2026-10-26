/**
 * Why: CORS policy for the HTTP server.
 * When: Global CORS middleware processes cross-origin requests.
 * Where: src/config/cors.ts.
 * How: `origin` accepts `"*"` for any origin or a comma-separated allow-list.
 *      `"*"` reflects the request origin (required for credentialed requests).
 */
import { env } from "@/env.js";

export const corsConfig = {
  origin: env.FRONTEND_URL || (env.APP_ENV === "production" ? env.APP_URL : "*")
};

export type CorsConfig = typeof corsConfig;
