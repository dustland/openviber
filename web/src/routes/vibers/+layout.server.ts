import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
    // Require authentication for vibers routes
    if (!locals.user) {
        const target = encodeURIComponent(`${url.pathname}${url.search}`);
        throw redirect(303, `/login?redirect=${target}`);
    }

    return {
        user: locals.user,
    };
};
