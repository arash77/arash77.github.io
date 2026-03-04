# kadkhodaei.de

Personal portfolio website for [Arash Kadkhodaei](https://kadkhodaei.de).

Built with **Astro 5**, **Tailwind CSS**, **shadcn/ui**, and **GSAP** animations. Hosted on **GitHub Pages**.

## Stack

| Layer | Tech |
|-------|------|
| Framework | Astro 5 (static output) |
| Styling | Tailwind CSS v3 + shadcn/ui |
| Animations | GSAP + ScrollTrigger |
| React Islands | `@astrojs/react` (Navbar, Hero, sections) |
| Content | Astro Content Collections (JSON) |
| Hosting | GitHub Pages via Actions |

## Development

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # Static output to dist/
npm run preview   # Preview dist/ locally
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

Valid categories: `Bioinformatics`, `Python Projects`, `Galaxy Core`, `Galaxy Training`, `UseGalaxy.eu`, `Python Libraries`, `Crypto`.
