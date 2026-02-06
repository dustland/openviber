import type { Handle } from "@sveltejs/kit";
import { getAuthUser } from "$lib/server/auth";

// Only these routes require authentication
const PROTECTED_PATHS = ["/vibers", "/api/vibers"];

function requiresAuth(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const handle: Handle = async ({ event, resolve }) => {
  // Skip auth for local testing when SKIP_AUTH is set (via shell env or .env)
  const skipAuth = process.env.SKIP_AUTH === "true";
  console.log('[hooks] SKIP_AUTH:', process.env.SKIP_AUTH, '-> skipAuth:', skipAuth);

  if (skipAuth) {
    event.locals.user = {
      id: "local-dev-user",
      email: "dev@localhost",
      name: "Local Developer",
      avatarUrl: null,
    };
    return resolve(event);
  }

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
