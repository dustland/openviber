import { redirect } from "@sveltejs/kit";

/** Redirect /settings to personalization (the agent's autobiography) */
export function load() {
  redirect(302, "/settings/general");
}
