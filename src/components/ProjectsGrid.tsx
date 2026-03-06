'use client';

import { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ExternalLink } from 'lucide-react';
import { IconGithub } from './BrandIcons';
import { Badge } from './ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';

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

export default function ProjectsGrid({ projects }: ProjectsGridProps) {
  const [activeCategory, setActiveCategory] = useState<ProjectCategory>('All');
  const gridRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const filtered =
    activeCategory === 'All'
      ? projects
      : projects.filter((p) => p.category === activeCategory);

  // Animate tabs on first mount
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    gsap.set(tabsRef.current, { opacity: 0, y: 16 });
    gsap.to(tabsRef.current, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.1 });
  }, []);

  // Animate cards on mount and category change
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.project-card',
        { opacity: 0, y: 20, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.4,
          stagger: 0.08,
          ease: 'power2.out',
        }
      );
    }, gridRef);

    return () => ctx.revert();
  }, [activeCategory]);

  const getLinkIcon = (label: string) => {
    if (label.toLowerCase().includes('pr') || label.toLowerCase().includes('repo'))
      return IconGithub;
    return ExternalLink;
  };

  return (
    <div>
      {/* Category tabs */}
      <div ref={tabsRef} style={{ opacity: 0 }} className="overflow-x-auto pb-2 mb-10 -mx-4 px-4">
        <Tabs
          value={activeCategory}
          onValueChange={(v) => setActiveCategory(v as ProjectCategory)}
        >
          <TabsList className="flex-nowrap whitespace-nowrap w-max h-auto p-1 gap-1 bg-muted rounded-xl">
            {CATEGORIES.map((cat) => (
              <TabsTrigger
                key={cat}
                value={cat}
                className="text-sm rounded-lg data-[state=active]:shadow-sm gap-1.5"
              >
                <span className="leading-none">{cat}</span>
                {cat !== 'All' && (
                  <span className="text-xs text-muted-foreground tabular-nums leading-none">
                    ({projects.filter((p) => p.category === cat).length})
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {CATEGORIES.map((cat) => (
            <TabsContent key={cat} value={cat}>
              {/* intentionally empty — grid renders below */}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Projects grid */}
      <div
        ref={gridRef}
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {filtered.map((project) => (
          <Card
            key={project.id}
            style={{ opacity: 0 }}
            className="project-card flex flex-col group hover:border-primary/30"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span
                  className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                    CATEGORY_COLORS[project.category] || 'bg-muted text-muted-foreground border-muted'
                  }`}
                >
                  {project.category}
                </span>
                {project.featured && (
                  <span className="text-xs font-mono text-secondary">★ Featured</span>
                )}
              </div>
              <h2 className="text-base font-semibold leading-snug tracking-tight group-hover:text-primary transition-colors">
                {project.title}
              </h2>
            </CardHeader>
            <CardContent className="flex-1 pb-4">
              <CardDescription className="text-sm leading-relaxed line-clamp-4">
                {project.description}
              </CardDescription>
            </CardContent>
            <CardContent className="pt-0 pb-3">
              <div className="flex flex-wrap gap-1.5 mb-4">
                {project.tags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="muted" className="text-xs font-mono">
                    {tag}
                  </Badge>
                ))}
                {project.tags.length > 4 && (
                  <Badge variant="muted" className="text-xs font-mono">
                    +{project.tags.length - 4}
                  </Badge>
                )}
              </div>
            </CardContent>
            <CardFooter className="pt-0 flex flex-wrap gap-2">
              {project.links.slice(0, 2).map((link) => {
                const Icon = getLinkIcon(link.label);
                return (
                  <Button key={link.label} asChild variant="outline" size="sm" className="text-xs gap-1.5">
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      <Icon className="h-3.5 w-3.5" />
                      {link.label}
                    </a>
                  </Button>
                );
              })}
            </CardFooter>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg font-mono">No projects in this category yet.</p>
        </div>
      )}
    </div>
  );
}
