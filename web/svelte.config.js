import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { mdsvex } from "mdsvex";

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
      remarkPlugins: [],
      rehypePlugins: [],
    }),
  ],

  kit: {
    adapter: adapter(),
    alias: {
      $lib: "./src/lib",
      $components: "./src/lib/components",
    },
  },
};

export default config;
