import { useState, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ExternalLink } from 'lucide-react';
import { IconGithub } from './BrandIcons';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

gsap.registerPlugin(useGSAP);

export type ProjectCategory =
  | 'All'
  | 'Bioinformatics'
  | 'Python Projects'
  | 'Galaxy Core'
  | 'Galaxy Training'
  | 'UseGalaxy.eu'
  | 'Python Libraries'
  | 'Crypto';

export interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  links: { label: string; url: string }[];
  tags: string[];
  featured: boolean;
}

interface ProjectsGridProps {
  projects: Project[];
}

const CATEGORIES: ProjectCategory[] = [
  'All',
  'Bioinformatics',
  'Galaxy Core',
  'Galaxy Training',
  'UseGalaxy.eu',
  'Python Projects',
  'Python Libraries',
  'Crypto',
];

const CATEGORY_COLORS: Record<string, string> = {
  Bioinformatics: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
  'Galaxy Core': 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
  'Galaxy Training': 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
  'UseGalaxy.eu': 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20',
  'Python Projects': 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/20',
  'Python Libraries': 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20',
  Crypto: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20',
};

function getLinkIcon(label: string) {
  if (label.toLowerCase().includes('pr') || label.toLowerCase().includes('repo'))
    return IconGithub;
  return ExternalLink;
}

export default function ProjectsGrid({ projects }: ProjectsGridProps) {
  const [activeCategory, setActiveCategory] = useState<ProjectCategory>('All');
  const [fades, setFades] = useState({ left: false, right: true });
  const filterRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setFades({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check, { passive: true });
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  const filtered =
    activeCategory === 'All'
      ? projects
      : projects.filter((p) => p.category === activeCategory);

  const featuredFiltered = filtered.filter((p) => p.featured);
  const regularFiltered = filtered.filter((p) => !p.featured);

  // Mount-only: animate the filter bar in once
  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.set(filterRef.current, { y: 16 });
    gsap.to(filterRef.current, {
      opacity: 1, visibility: 'inherit', y: 0, duration: 0.5, ease: 'power2.out', delay: 0.1,
    });
  }, { scope: filterRef });

  // Category-change: re-animate cards
  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.set('.project-section-label', { y: 10 });
    gsap.to('.project-section-label', {
      opacity: 1, visibility: 'inherit', y: 0, duration: 0.5, ease: 'power2.inOut',
    });
    gsap.set('.project-card', { y: 20, scale: 0.97 });
    gsap.to('.project-card', {
      opacity: 1,
      visibility: 'inherit',
      y: 0,
      scale: 1,
      duration: 0.5,
      stagger: { each: 0.08, ease: 'power2.in' },
      ease: 'power3.out',
      delay: 0.1,
    });
  }, { scope: gridRef, dependencies: [activeCategory], revertOnUpdate: true });

  return (
    <div>
      {/* Category filter */}
      <div ref={filterRef} className="gsap-reveal relative overflow-hidden pb-2 mb-10">
        {/* Left-edge fade — appears after scrolling right */}
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent z-10 sm:hidden transition-opacity duration-300 ease-in-out ${fades.left ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden="true"
        />
        {/* Right-edge fade — disappears when scrolled to end */}
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent z-10 sm:hidden transition-opacity duration-300 ease-in-out ${fades.right ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden="true"
        />
        <div ref={scrollRef} className="overflow-x-auto">
        <div className="flex gap-1.5 w-max bg-muted rounded-xl p-1 mx-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeCategory === cat
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
              {cat !== 'All' && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  ({projects.filter((p) => p.category === cat).length})
                </span>
              )}
            </button>
          ))}
        </div>
        </div>
      </div>

      <div ref={gridRef}>
        {/* Featured tier — full-width hero cards */}
        {featuredFiltered.length > 0 && (
          <div className="mb-10">
            <p className="gsap-reveal project-section-label text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">
              Featured Work
            </p>
            <div className="space-y-4">
              {featuredFiltered.map((project) => (
                <article
                  key={project.id}
                  className="gsap-reveal project-card rounded-xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-md transition-[border-color,box-shadow] duration-150"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <span
                      className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                        CATEGORY_COLORS[project.category] || 'bg-muted text-muted-foreground border-muted'
                      }`}
                    >
                      {project.category}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {project.tags.map((tag) => (
                        <Badge key={tag} variant="muted" className="text-xs font-mono">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <h2 className="text-lg font-bold mb-2">{project.title}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    {project.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {project.links.map((link) => {
                      const Icon = getLinkIcon(link.label);
                      return (
                        <Button key={link.label} asChild variant="outline" size="sm" className="text-xs gap-1.5">
                          <a href={link.url} target="_blank" rel="noopener noreferrer">
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {link.label}
                          </a>
                        </Button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* Regular tier — compact 3-column grid */}
        {regularFiltered.length > 0 && (
          <div>
            {featuredFiltered.length > 0 && (
              <p className="gsap-reveal project-section-label text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">
                Other Contributions
              </p>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {regularFiltered.map((project) => (
                <article
                  key={project.id}
                  className="gsap-reveal project-card flex flex-col rounded-xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-md transition-[border-color,box-shadow] duration-150"
                >
                  <div className="mb-2">
                    <span
                      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                        CATEGORY_COLORS[project.category] || 'bg-muted text-muted-foreground border-muted'
                      }`}
                    >
                      {project.category}
                    </span>
                  </div>
                  <h2 className="text-sm font-semibold leading-snug mb-2">{project.title}</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1 mb-3">
                    {project.description}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {project.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="muted" className="text-xs font-mono">
                        {tag}
                      </Badge>
                    ))}
                    {project.tags.length > 3 && (
                      <Badge variant="muted" className="text-xs font-mono">+{project.tags.length - 3}</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {project.links.slice(0, 2).map((link) => {
                      const Icon = getLinkIcon(link.label);
                      return (
                        <Button key={link.label} asChild variant="outline" size="sm" className="text-xs gap-1 h-7 px-2">
                          <a href={link.url} target="_blank" rel="noopener noreferrer">
                            <Icon className="h-3 w-3" aria-hidden="true" />
                            {link.label}
                          </a>
                        </Button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg font-mono">No projects in this category yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
