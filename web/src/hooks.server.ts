import type { Handle, HandleServerError } from "@sveltejs/kit";
import { getAuthUser } from "$lib/server/auth";

// Only these routes require authentication
const PROTECTED_PATHS = [
  "/vibers",
  "/settings",
  "/skills",
  "/jobs",
  "/nodes",
  "/environments",
  "/api/vibers",
  "/api/nodes",
  "/api/environments",
  "/api/threads",
  "/api/skills",
  "/api/skill-hub",
  "/api/jobs",
];

// These paths are excluded from auth even if they match a protected prefix
const AUTH_EXCLUDED_PATHS = ["/api/nodes/onboard"];

function requiresAuth(pathname: string) {
  if (AUTH_EXCLUDED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return false;
  }
  // Dashboard root is protected (exact match only — "/" prefix would match everything)
  if (pathname === "/") return true;
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = await getAuthUser(event.cookies);

  const { pathname } = event.url;

  // Only protect vibers routes
  if (!event.locals.user && requiresAuth(pathname)) {
    const isApi = pathname.startsWith("/api/");
    if (isApi) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const target = encodeURIComponent(`${pathname}${event.url.search}`);
    return new Response(null, {
      status: 303,
      headers: { Location: `/landing?redirect=${target}` },
    });
  }

  return resolve(event);
};

/**
 * Suppress verbose error logging for 404s (bot scanners).
 * Only real 500-level errors produce full stack traces.
 */
export const handleError: HandleServerError = ({ error, status, message, event }) => {
  if (status === 404) {
    // One-line log for 404s — no stack trace
    console.warn(`[404] ${event.request.method} ${event.url.pathname}`);
    return { message: "Not Found" };
  }

  // Real errors get full logging
  console.error(`[Server Error] ${status} ${event.url.pathname}`, error);
  return { message };
};
