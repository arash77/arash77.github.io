import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  site: 'https://kadkhodaei.de',
  output: 'static',
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap(),
    mdx(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
  vite: {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});
