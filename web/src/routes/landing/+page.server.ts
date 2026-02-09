import { supabaseAuthConfigured } from "$lib/server/auth";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  return {
    user: locals.user,
    supabaseAuthEnabled: supabaseAuthConfigured(),
    redirectTo: url.searchParams.get("redirect") || "/",
  };
};
