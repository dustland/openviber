import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const githubToken = locals.user.githubToken;
  if (!githubToken) {
    return json(
      { error: "GitHub not connected", connected: false },
      { status: 401 },
    );
  }

  const owner = url.searchParams.get("owner")?.trim();
  const repo = url.searchParams.get("repo")?.trim();

  if (!owner || !repo) {
    return json(
      { error: "Missing owner or repo parameter" },
      { status: 400 },
    );
  }

  const perPage = Math.min(
    parseInt(url.searchParams.get("per_page") || "100", 10),
    100,
  );

  try {
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=${perPage}`;

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[GitHub API] branches", response.status, errorBody);
      return json(
        { error: "GitHub API error", details: response.status },
        { status: 502 },
      );
    }

    const data = await response.json();

    const branches = (data as Array<Record<string, unknown>>).map(
      (branch) => ({
        name: branch.name as string,
        protected: branch.protected as boolean,
      }),
    );

    return json({ branches, connected: true });
  } catch (error) {
    console.error("[GitHub API] branches fetch error:", error);
    return json({ error: "Failed to fetch branches" }, { status: 500 });
  }
};
