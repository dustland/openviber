import { json, type RequestHandler } from "@sveltejs/kit";
import { isE2ETestMode, getE2ETestUser } from "$lib/server/auth";

/**
 * GET /auth/test-session
 *
 * Returns the current E2E test mode status and test user details.
 * Useful for AI agents to verify test mode is active before running tests.
 */
export const GET: RequestHandler = async () => {
  if (!isE2ETestMode()) {
    return json(
      {
        error: "E2E test mode is not enabled. Set E2E_TEST_MODE=true in web/.env.",
        testMode: false,
      },
      { status: 403 },
    );
  }

  return json({
    testMode: true,
    user: getE2ETestUser(),
    message:
      "E2E test mode is active. All protected routes are accessible without OAuth. " +
      "Onboarding gate is bypassed.",
  });
};
