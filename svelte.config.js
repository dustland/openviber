import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/vite-plugin-svelte').ConfigFile} */
const config = {
  preprocess: vitePreprocess()
};

export default config;
