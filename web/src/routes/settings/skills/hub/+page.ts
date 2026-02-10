import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

/**
 * Discover & import is now on the main Skills page (/skills).
 * Redirect legacy /settings/skills/hub links there.
 */
export const load: PageLoad = () => {
  throw redirect(302, "/skills");
};
