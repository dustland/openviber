import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 6006,
    host: true,
    fs: {
      allow: [".."], // Allow reading from parent directory (for docs/)
    },
  },
  ssr: {
    noExternal: ["svelte-sonner"],
  },
});
