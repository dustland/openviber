/**
 * Load doc metadata and key for mdsvex-rendered docs.
 * Rendering happens in +page.svelte by importing the compiled component.
 */
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

type DocModule = {
  metadata?: Record<string, unknown>;
  default: unknown;
};

// Eager-load all mdsvex-compiled docs so we can find metadata and keys
const docModules = import.meta.glob("$docs/**/*.md", {
  eager: true,
}) as Record<string, DocModule>;

export const load: PageLoad = async ({ params }) => {
  const slug = params.slug;
  if (!slug) throw error(404, "Not found");

  const key = Object.keys(docModules).find((k) => k.endsWith(`${slug}.md`));
  if (!key) throw error(404, "Not found");

  const mod = docModules[key];
  const metadata = (mod?.metadata ?? {}) as Record<string, unknown>;

  return { key, metadata };
};
