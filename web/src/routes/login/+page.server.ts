import { redirect } from "@sveltejs/kit";
import { supabaseAuthConfigured } from "$lib/server/auth";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.user) {
    const redirectTo = url.searchParams.get("redirect") || "/vibers";
    throw redirect(303, redirectTo);
  }

  return {
    supabaseAuthEnabled: supabaseAuthConfigured(),
    redirectTo: url.searchParams.get("redirect") || "/vibers",
  };
};
