import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: 'Viber',
      logo: {
        src: './src/assets/logo.png',
      },
      favicon: '/favicon.png',
      description: 'Multi-agent collaboration framework for vibe working',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/tiwater/viber' },
      ],
      head: [],
      components: {
        Header: './src/components/header.astro',
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Agents', slug: 'guides/agents' },
            { label: 'Tools', slug: 'guides/tools' },
            { label: 'Spaces', slug: 'guides/spaces' },
            { label: 'Streaming', slug: 'guides/streaming' },
            { label: 'State Management', slug: 'guides/state' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'Overview', slug: 'api' },
            { label: 'Types', slug: 'api/types' },
          ],
        },
        {
          label: 'Design',
          items: [
            { label: 'Architecture', slug: 'design/architecture' },
            { label: 'Framework Comparison', slug: 'design/framework-comparison' },
          ],
        },
        {
          label: 'Playground',
          link: '/playground',
        },
      ],

    }),
    svelte(),
  ],
  output: 'static',
  server: {
    port: 6006,
    host: true,
  },
  vite: {
    ssr: {
      noExternal: ['viber'],
    },
    plugins: [
      tailwindcss(),
    ],
    resolve: {
      alias: {
        'viber/svelte': path.resolve(__dirname, '../src/svelte/index.ts'),
        'viber': path.resolve(__dirname, '../src/index.ts'),
        '$lib': path.resolve(__dirname, './src/lib'),
      },
    },
  },
});
