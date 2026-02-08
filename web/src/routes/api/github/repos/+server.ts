import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const githubToken = locals.user.githubToken;
  if (!githubToken) {
    return json({ error: "GitHub not connected", connected: false }, { status: 401 });
  }

  const query = url.searchParams.get("q") || "";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const perPage = Math.min(parseInt(url.searchParams.get("per_page") || "30", 10), 100);

  try {
    // Use GitHub search API when query is provided, otherwise list user repos
    let apiUrl: string;
    if (query.trim()) {
      const searchQuery = `${query} in:name fork:true`;
      apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&per_page=${perPage}&page=${page}&sort=updated`;
    } else {
      apiUrl = `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`;
    }

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[GitHub API]", response.status, errorBody);
      return json({ error: "GitHub API error", details: response.status }, { status: 502 });
    }

    const data = await response.json();

    // Normalize response shape (search vs list have different structures)
    const items = query.trim() ? data.items : data;

    const repos = items.map((repo: Record<string, unknown>) => ({
      fullName: repo.full_name,
      name: repo.name,
      owner: (repo.owner as Record<string, unknown>)?.login,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch,
      private: repo.private,
      description: repo.description,
      updatedAt: repo.updated_at,
    }));

    return json({ repos, connected: true });
  } catch (error) {
    console.error("[GitHub API] fetch error:", error);
    return json({ error: "Failed to fetch repos" }, { status: 500 });
  }
};
