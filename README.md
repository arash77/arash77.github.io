# kadkhodaei.de

Personal portfolio website for [Arash Kadkhodaei](https://kadkhodaei.de).

Built with **Astro**, **Tailwind CSS**, **shadcn/ui**, and **GSAP** animations. Hosted on **Cloudflare Pages**.

## Stack

| Layer | Tech |
|-------|------|
| Framework | Astro (static output) |
| Styling | Tailwind CSS + shadcn/ui |
| Animations | GSAP + ScrollTrigger |
| React Islands | `@astrojs/react` (Navbar, Hero, sections) |
| Content | Astro Content Collections (JSON) |
| Hosting | Cloudflare Pages via GitHub Actions (previews per PR at `pr-N.kadkhodaei.pages.dev`) |

## Development

```bash
pnpm install
pnpm dev          # http://localhost:4321
pnpm build        # Static output to dist/
pnpm preview      # Preview dist/ locally
pnpm test         # Unit + e2e tests
pnpm test:visual  # Visual regression (baselines are generated in CI, not locally)
```

## Adding a Project

Create a JSON file in `src/content/projects/`:

```json
{
  "title": "My Project",
  "description": "What it does.",
  "category": "Python Projects",
  "links": [{ "label": "Repository", "url": "https://github.com/..." }],
  "tags": ["Python"],
  "featured": false
}
```

Valid categories: `Bioinformatics`, `Python Projects`, `Galaxy Core`, `Galaxy Training`, `UseGalaxy.eu`, `Python Libraries`, `Crypto`, `Other`.
