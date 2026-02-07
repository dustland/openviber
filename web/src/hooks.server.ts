import type { Handle } from "@sveltejs/kit";
import { getAuthUser } from "$lib/server/auth";

// Only these routes require authentication
const PROTECTED_PATHS = ["/vibers", "/api/vibers", "/api/nodes"];

// These paths are excluded from auth even if they match a protected prefix
const AUTH_EXCLUDED_PATHS = ["/api/nodes/onboard"];

function requiresAuth(pathname: string) {
  if (AUTH_EXCLUDED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return false;
  }
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
      headers: { Location: `/login?redirect=${target}` },
    });
  }

  return resolve(event);
};
