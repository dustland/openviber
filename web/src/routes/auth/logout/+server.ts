import type { RequestHandler } from "./$types";
import { deleteSession } from "$lib/server/auth";

export const POST: RequestHandler = async ({ cookies }) => {
  await deleteSession(cookies);
  return new Response(null, {
    status: 303,
    headers: { Location: "/login" },
  });
};
