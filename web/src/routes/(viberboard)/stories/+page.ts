import { redirect } from "@sveltejs/kit";

/** Redirect old /stories route to /vibers/new (intents live there now) */
export function load() {
  redirect(302, "/vibers/new");
}
