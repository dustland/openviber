import type { RequestHandler } from "./$types";

/**
 * Serve robots.txt to prevent bot-scanner 404 noise in logs.
 * Allows all crawlers by default.
 */
export const GET: RequestHandler = async () => {
  const body = `User-agent: *
Allow: /

# Block common scanner paths
Disallow: /wp-admin/
Disallow: /wp-includes/
Disallow: /wp-content/
Disallow: /api/
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
