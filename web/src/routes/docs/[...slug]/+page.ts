/**
 * Load doc content from flat lib/docs/*.md by slug.
 * e.g. /docs/design/arch -> lib/docs/design/arch.md
 */
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

// Eager-load all .md files so we can resolve by slug at load time
const docModules: Record<string, string> = import.meta.glob(
  "/src/lib/docs/**/*.md",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

function parseFrontmatter(raw: string): {
  title?: string;
  description?: string;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { body: raw };
  const [, front, body] = match;
  const title = front?.match(/title:\s*["']?([^"'\n]+)["']?/)?.[1]?.trim();
  const description = front
    ?.match(/description:\s*["']?([^"'\n]+)["']?/)?.[1]
    ?.trim();
  return { title, description, body: body ?? raw };
}

export const load: PageLoad = async ({ params }) => {
  const slug = params.slug;
  if (!slug) throw error(404, "Not found");

  const key = Object.keys(docModules).find((k) => k.endsWith(`${slug}.md`));
  if (!key) throw error(404, "Not found");

  const raw = docModules[key];
  const { title, description, body } = parseFrontmatter(raw);

  return { content: body, title, description };
};
