import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE ?? 'https://kadkhodaei.de',
  output: 'static',
  // One small stylesheet: inlined, it renders with the HTML instead of
  // blocking the first paint on a second request.
  build: { inlineStylesheets: 'always' },
  fonts: [
    {
      name: 'Inter',
      cssVariable: '--font-inter',
      provider: fontProviders.fontsource(),
      weights: [400, 500, 600, 700, 800],
    },
    {
      name: 'JetBrains Mono',
      cssVariable: '--font-jetbrains-mono',
      provider: fontProviders.fontsource(),
      weights: [400, 500, 600],
    },
  ],
  integrations: [
    react(),
    sitemap({
      // Legal pages carry noindex; listing them in the sitemap would contradict it.
      filter: (page) => !/\/(impressum|datenschutz)\/?$/.test(new URL(page).pathname),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});
