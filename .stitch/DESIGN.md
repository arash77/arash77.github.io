# kadkhodaei.de – Design System

**Stitch Project ID:** `14599844612847566077`
**Design System Asset:** `assets/8474306332739250531`

Open the live project at: https://stitch.withgoogle.com (search for "kadkhodaei.de – Portfolio")

---

## 1. Identity & North Star

Personal portfolio of **Arash Kadkhodaei** — Software Engineer specializing in Python backend, FastAPI, and the Galaxy bioinformatics project at Freiburg University.

**Personality:** Precise. Open-source. Engineering-minded. Not a startup, not a creative agency — a craftsperson who ships real, impactful systems.

**Differentiator:** This is an engineer's portfolio. The design should feel like a high-quality technical journal, not a marketing site. Density and clarity over decoration.

---

## 2. Color Palette

| Role | Token | Light Mode | Dark Mode |
|------|-------|-----------|----------|
| Primary | `--primary` | `#0a8a8a` (deep teal) | `hsl(186 72% 55%)` |
| Secondary | `--secondary` | `#159957` (forest green) | `hsl(155 62% 48%)` |
| Background | `--background` | `hsl(186 40% 98%)` near-white teal tint | `#041618` deep teal-black |
| Foreground | `--foreground` | `hsl(186 65% 8%)` deep teal-black | `hsl(185 20% 95%)` |
| Card | `--card` | `hsl(186 28% 93%)` | `hsl(186 55% 9%)` |
| Muted | `--muted` | `hsl(186 25% 88%)` | `hsl(186 38% 14%)` |
| Muted text | `--muted-foreground` | `hsl(186 22% 28%)` | `hsl(186 16% 72%)` |
| Border | `--border` | `hsl(186 22% 80%)` | `hsl(186 32% 17%)` |

**Rules:**
- Never use pure `#ffffff` or `#000000` — always tinted
- Never use gray text on colored backgrounds — use a tinted variant
- Teal is the dominant hue; green is the accent for open-source/growth signals

---

## 3. Typography

| Level | Font | Weight | Size | Tracking |
|-------|------|--------|------|---------|
| Display / H1 | Plus Jakarta Sans | 800 | `clamp(2.5rem, 6vw, 4.5rem)` | `-0.03em` |
| H2 (Section) | Plus Jakarta Sans | 700 | `2.5rem` | `-0.02em` |
| H3 (Card) | Plus Jakarta Sans | 600 | `1.125rem` | `0` |
| Body | Plus Jakarta Sans | 400 | `1rem` | `0` |
| Body large | Plus Jakarta Sans | 400 | `1.125rem` | `0` |
| Eyebrow / Label | JetBrains Mono | 500 | `0.75rem` | `0.12em` uppercase |
| Tech tags | JetBrains Mono | 400 | `0.75rem` | `0` |
| Dates / Meta | Space Grotesk | 400 | `0.8125rem` | `0` |

**Line heights:** Body 1.65, Headings 1.15

---

## 4. Spacing & Layout

- **Max content width:** 1200px (`max-w-6xl`)
- **Section padding:** `py-24` (reduce to `py-16` for tighter sections)
- **Container horizontal padding:** `px-4` → `px-8` on large screens
- **Rhythm:** Alternate section backgrounds (white → muted teal tint → white) to define sections WITHOUT borders or dividers

---

## 5. Elevation & Depth

Use **tonal shifts only** — no heavy drop shadows.

| Context | Approach |
|---------|----------|
| Section separation | Background color shift (white ↔ `bg-muted/30`) |
| Card on section | `bg-card` on `bg-muted/30` background — 2-3% luminosity difference |
| Active/floating element | `box-shadow: 0 20px 48px hsla(186, 72%, 28%, 0.08)` — large, diffuse, tinted |
| Border fallback | `ring-1 ring-border/50` — felt not seen |

---

## 6. Component Patterns (required for Stitch prompt generation)

### Navbar
Sticky. `h-16`. Transparent → `bg-background/80 backdrop-blur-md border-b` on scroll.
Left: logo image + name in Plus Jakarta Sans semi-bold.
Right: nav links (plain text, `text-muted-foreground` → `text-primary` on active), dark mode toggle.

### Section Headings (NON-NEGOTIABLE)
```
EYEBROW TEXT  ← small mono uppercase, text-secondary, tracking-widest
H2 Title      ← bold, left-aligned, no gradient, no underline bar
```
**DO NOT:** center section headings. **DO NOT:** add gradient divider bars.

### Hero
Full viewport height. Split layout: text LEFT + circular avatar RIGHT (on desktop).
Text: eyebrow label → h1 name → subtitle → tech tag pills → CTA buttons → social icon links.
**NO:** blobs, gradient-mesh, gradient text, decorative SVG waves.

### Tech Badge / Skill Pill
`bg-muted text-muted-foreground border border-border rounded-full px-3 py-1 text-xs font-mono`
With optional icon (3×3). Hover: `hover:brightness-110`.

### Experience Timeline
Vertical `2px bg-border` line on the left. Circle node at each entry:
- Current role: `bg-primary border-primary text-primary-foreground` + pulsing green dot
- Past role: `bg-card border-border text-muted-foreground`
No card wrappers around timeline entries — entries breathe via vertical spacing only.

### Contact Links
`<a>` elements styled as rows: icon + label/value. `hover:border-primary/30 hover:shadow-md` transition. No form — just direct links.

---

## 7. Anti-Patterns (NEVER USE)

| Anti-pattern | Why |
|-------------|-----|
| `bg-clip-text text-transparent` gradient text | #1 AI slop tell |
| Animated blobs / floating orbs | #2 AI slop tell |
| `gradient-mesh` or repeated radial-gradient backgrounds | #3 AI slop tell |
| `w-16 h-1 bg-linear-to-r from-primary to-secondary` divider bar | Stamp of template portfolio |
| Centered section H2 headings | Breaks editorial rhythm |
| Card-in-card nesting | Visual noise |
| Pure `#000` / `#fff` | Never appears in nature |
| Cyan-on-dark, purple-to-blue, neon accents | AI default palette |

---

## 8. Pages

| Page | Route | Key sections |
|------|-------|-------------|
| Home | `/` | Navbar, Hero, About, Skills, Experience, Education, Contact |
| Projects | `/projects` | Navbar, Page header, Category filter tabs, Featured grid, Regular grid |
| Resume | `/resume` | Navbar, Print-optimized layout |

---

## 9. Stitch Generation Instructions

When generating any new screen for this project, include this block in every prompt:

```
**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first
- Palette: Deep teal primary (#0a8a8a), forest green secondary (#159957), near-white teal-tinted background
- Fonts: Plus Jakarta Sans headlines+body; Space Grotesk mono for eyebrows/labels/tags
- Roundness: 8px on cards, full-pill on badges
- Section headings: LEFT-ALIGNED eyebrow + H2, no divider bar
- Elevate with tonal shifts only — no heavy shadows, no section borders
- Anti-patterns to AVOID: gradient text, animated blobs, gradient divider bars, glassmorphism on hero
```
