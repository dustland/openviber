import type { PageServerLoad } from "./$types";

interface Job {
  name: string;
  description?: string;
  schedule: string;
  scheduleDescription: string;
  model?: string;
  prompt?: string;
  enabled: boolean;
  filename: string;
}

export const load: PageServerLoad = async ({ fetch, params }) => {
  try {
    const res = await fetch(`/api/vibers/${params.id}/jobs`);
    if (!res.ok) {
      return { jobs: [], error: "Failed to load jobs" };
    }
    const data = await res.json();
    return {
      jobs: data.jobsWithDescriptions || data.jobs || [],
    };
  } catch (err) {
    console.error("[Jobs Page] Failed to load jobs:", err);
    return { jobs: [], error: "Failed to load jobs" };
  }
};
