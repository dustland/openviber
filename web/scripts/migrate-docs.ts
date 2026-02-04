/**
 * Migrate docs from routes (one folder per doc) to docs/ at project root.
 * Run from web/: pnpm exec tsx scripts/migrate-docs.ts
 * 
 * Note: This script was used for initial migration. Docs now live at /docs/
 */
import fs from "fs";
import path from "path";

const ROUTES_DOCS = path.join(process.cwd(), "src", "routes", "docs");
const LIB_DOCS = path.join(process.cwd(), "..", "docs"); // Now at project root

function findPageMdFiles(dir: string, base = ""): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      files.push(...findPageMdFiles(path.join(dir, e.name), rel));
    } else if (e.name === "+page.md") {
      files.push(path.join(dir, e.name));
    }
  }
  return files;
}

function transform(content: string): string {
  let out = content
    // Remove mdsvex import line
    .replace(/\nimport\s+\{[^}]+\}\s+from\s+["'][^"']+["'];\s*\n/g, "\n")
    // Aside type="tip" -> ::: tip
    .replace(/<Aside\s+type="tip"\s*>\s*\n?/g, "::: tip\n")
    .replace(/<Aside\s+type="note"\s*>\s*\n?/g, "::: note\n")
    .replace(/<Aside\s+type="caution"\s*>\s*\n?/g, "::: caution\n")
    .replace(/\s*<\/Aside>\s*/g, "\n:::\n");
  // CardGrid + LinkCard -> markdown list
  const linkCardRegex =
    /<LinkCard\s+title="([^"]+)"\s+href="([^"]+)"\s+(?:description="([^"]*)"\s*)?\/>/g;
  out = out.replace(/<CardGrid>\s*\n?/g, "");
  out = out.replace(/\s*<\/CardGrid>/g, "");
  out = out.replace(linkCardRegex, (_, title, href, desc) => {
    const d = desc ? ` — ${desc}` : "";
    const fullHref = href.startsWith("/docs")
      ? href
      : `/docs${href.startsWith("/") ? href : "/" + href}`;
    return `- [${title}](${fullHref})${d}\n`;
  });
  // Fix bare /design/... etc. to /docs/design/...
  out = out.replace(
    /\](\(\/(design|api|getting-started|guides|reference|tutorials)\/)/g,
    "](/docs/$1/",
  );
  return out;
}

const pageFiles = findPageMdFiles(ROUTES_DOCS);
for (const filePath of pageFiles) {
  const rel = path.relative(path.join(ROUTES_DOCS), path.dirname(filePath));
  // Skip root index (docs/+page.md) — keep it as the route
  if (rel === "") continue;
  const outPath = path.join(LIB_DOCS, `${rel}.md`);
  const content = fs.readFileSync(filePath, "utf8");
  const transformed = transform(content);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, transformed);
  console.log(`${rel}.md`);
}

console.log(`Done: ${pageFiles.length} files -> docs/`);
