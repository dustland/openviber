import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { mdsvex } from "mdsvex";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { createHighlighter } from "shiki";
import { visit } from "unist-util-visit";

const shiki = await createHighlighter({
  themes: ["github-light", "github-dark"],
  langs: [
    "plaintext",
    "bash",
    "sh",
    "zsh",
    "js",
    "ts",
    "jsx",
    "tsx",
    "json",
    "yaml",
    "yml",
    "md",
    "diff",
    "html",
    "css",
    "svelte",
    "python",
    "go",
    "rust",
    "sql",
    "toml",
  ],
});

const languageAliases = {
  text: "plaintext",
  shell: "bash",
  javascript: "js",
  typescript: "ts",
  markdown: "md",
};

const loadedLanguages = new Set(
  shiki.getLoadedLanguages().map((lang) => String(lang)),
);

function resolveLanguage(lang) {
  const normalized = (lang ?? "plaintext").toString().toLowerCase();
  const aliased = languageAliases[normalized] || normalized;
  return loadedLanguages.has(aliased) ? aliased : "plaintext";
}

function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Escape Svelte mustache braces inside code blocks
    .replace(/{/g, "&#123;")
    .replace(/}/g, "&#125;");
}

// Convert ::: tip style directives into aside divs
function remarkAsides() {
  const inlineAsideRegex = /^:::\s*([a-zA-Z][\w-]*)\s+([\s\S]*?)\s*:::\s*$/;

  return (tree) => {
    visit(tree, (node) => {
      // Support single-line admonitions like:
      // ::: tip message :::
      if (
        node.type === "paragraph" &&
        Array.isArray(node.children) &&
        node.children.length === 1 &&
        node.children[0]?.type === "text"
      ) {
        const value = node.children[0].value;
        const match = value.match(inlineAsideRegex);
        if (match) {
          const [, type, body] = match;
          node.type = "containerDirective";
          node.name = type;
          node.attributes = {};
          node.children = [
            {
              type: "paragraph",
              children: [{ type: "text", value: body.trim() }],
            },
          ];
        }
      }

      if (node.type !== "containerDirective") return;
      const type = node.name || "note";
      const data = node.data || (node.data = {});
      data.hName = "div";
      data.hProperties = {
        ...(data.hProperties || {}),
        className: ["aside", `aside-${type}`],
      };
      const title = type.charAt(0).toUpperCase() + type.slice(1);
      node.children.unshift({
        type: "paragraph",
        children: [
          {
            type: "strong",
            children: [{ type: "text", value: title }],
          },
        ],
      });
    });
  };
}

// Escape curly braces in inline code and text to prevent Svelte interpolation
function remarkEscapeBraces() {
  return (tree) => {
    visit(tree, (node) => {
      if (node.type === "inlineCode" || node.type === "text") {
        if (node.value) {
          node.value = node.value.replace(/{/g, "&#123;").replace(/}/g, "&#125;");
        }
      }
    });
  };
}

// Convert ```mermaid fences to runtime-rendered mermaid blocks
function remarkMermaid() {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "mermaid") return;
      if (!parent || typeof index !== "number") return;

      parent.children[index] = {
        type: "html",
        value: `<div class="mermaid">${escapeHtml(node.value || "")}</div>`,
      };
    });
  };
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: [".svelte", ".md", ".mdx"],

  preprocess: [
    vitePreprocess(),
    mdsvex({
      extensions: [".md", ".mdx"],
      smartypants: {
        dashes: "oldschool",
      },
      remarkPlugins: [remarkGfm, remarkDirective, remarkAsides, remarkMermaid, remarkEscapeBraces],
      rehypePlugins: [],
      highlight: {
        // Use a simple escaped code block to avoid SSR parse issues from large
        // pre-rendered Shiki HTML blobs.
        highlighter: (code, lang = "plaintext") => {
          const safeLang = resolveLanguage(lang);
          return `<pre class="code-block"><code class="language-${safeLang}">${escapeHtml(
            code,
          )}</code></pre>`;
        },
      },
    }),
  ],

  kit: {
    adapter: adapter(),
    alias: {
      $lib: "./src/lib",
      $components: "./src/lib/components",
      $docs: "../docs",
    },
  },
};

export default config;
