import { isE2ETestMode } from "$lib/server/auth";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user,
    e2eTestMode: isE2ETestMode(),
  };
};
