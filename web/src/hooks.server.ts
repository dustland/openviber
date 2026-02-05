import type { Handle } from "@sveltejs/kit";
import { getAuthUser } from "$lib/server/auth";

const PUBLIC_PATHS = ["/", "/docs", "/login", "/auth/google", "/auth/google/callback", "/auth/session"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = await getAuthUser(event.cookies);

  const { pathname } = event.url;
  const isApi = pathname.startsWith("/api/");

  if (!event.locals.user && !isPublicPath(pathname)) {
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
