# kadkhodaei.de

Source of the personal website of [Arash Kadkhodaei](https://kadkhodaei.de): a static site built with [Astro](https://astro.build).

The full stack and current versions are in [`package.json`](package.json); this README deliberately avoids repeating them.

## Development

```bash
pnpm install
pnpm dev      # local dev server
pnpm build    # static output in dist/
pnpm test     # unit and end-to-end tests
```

All available commands are the `scripts` in [`package.json`](package.json).

## Content

Projects are JSON files in [`src/content/projects/`](src/content/projects/). Their fields and allowed categories are defined by the schema in [`src/content.config.ts`](src/content.config.ts); copy an existing file as a starting point.

## Deployment

- Every push to `main` is built, deployed to Cloudflare Pages and smoke-tested by [`deploy.yml`](.github/workflows/deploy.yml).
- Every pull request gets its own preview deployment, linked in a PR comment by [`preview.yml`](.github/workflows/preview.yml).
- Dependencies are updated automatically by Renovate, configured in [`renovate.json`](renovate.json).
