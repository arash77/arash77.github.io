'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ArrowRight, Download } from 'lucide-react';
import { IconGithub, IconLinkedin } from './BrandIcons';
import { Button } from './ui/button';
import { SITE } from '@/lib/utils';

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const helloRef = useRef<HTMLParagraphElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Respect reduced motion
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.fromTo(
        imageRef.current,
        { opacity: 0, scale: 0.8 },
        { opacity: 1, scale: 1, duration: 0.8 }
      )
        .fromTo(
          helloRef.current,
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.5 },
          '-=0.4'
        )
        .fromTo(
          nameRef.current,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.7 },
          '-=0.4'
        )
        .fromTo(
          subtitleRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6 },
          '-=0.3'
        )
        .fromTo(
          tagsRef.current,
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.5 },
          '-=0.2'
        )
        .fromTo(
          ctaRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6 },
          '-=0.2'
        );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden gradient-mesh pt-16"
    >
      {/* Decorative blobs */}
      <div
        className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/25 dark:bg-primary/10 rounded-full blur-3xl pointer-events-none animate-blob-drift-1"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 dark:bg-secondary/10 rounded-full blur-3xl pointer-events-none animate-blob-drift-2"
        aria-hidden="true"
      />
      <div
        className="absolute top-1/2 left-1/2 w-80 h-80 bg-primary/15 dark:bg-primary/5 rounded-full blur-3xl pointer-events-none animate-blob-drift-3"
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 max-w-6xl py-20">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Profile image */}
          <div ref={imageRef} className="relative flex-shrink-0" style={{ opacity: 0 }}>
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-secondary opacity-80 blur-lg scale-110" />
              <img
                src={SITE.avatar}
                alt={SITE.name}
                width={220}
                height={220}
                className="relative rounded-full border-4 border-background shadow-2xl w-44 h-44 lg:w-56 lg:h-56 object-cover"
                loading="eager"
              />
            </div>

          </div>

          {/* Text content */}
          <div className="flex-1 text-center lg:text-left">
            <p ref={helloRef} className="text-sm font-mono text-secondary mb-3 tracking-widest uppercase" style={{ opacity: 0 }}>
              Hello, I'm
            </p>
            <h1
              ref={nameRef}
              className="text-5xl lg:text-7xl font-bold tracking-tight mb-4"
              style={{ opacity: 0 }}
            >
              Arash{' '}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Kadkhodaei
              </span>
            </h1>
            <p
              ref={subtitleRef}
              className="text-xl lg:text-2xl text-muted-foreground mb-6 max-w-xl mx-auto lg:mx-0"
              style={{ opacity: 0 }}
            >
              Software Engineer specialising in <span className="text-foreground font-medium">Backend & Distributed Systems</span>
            </p>

            {/* Tags */}
            <div ref={tagsRef} className="flex flex-wrap gap-2 justify-center lg:justify-start mb-8" style={{ opacity: 0 }}>
              {['Python', 'FastAPI', 'Galaxy Project', 'Docker', 'CI/CD'].map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-mono bg-muted text-muted-foreground border border-border rounded-full px-3 py-1"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div
              ref={ctaRef}
              className="flex flex-wrap gap-4 justify-center lg:justify-start"
              style={{ opacity: 0 }}
            >
              <Button asChild size="lg" className="gap-2">
                <a href="/projects">
                  View Projects <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="gap-2">
                <a href="/assets/resume.pdf" download>
                  Download Resume <Download className="h-4 w-4" />
                </a>
              </Button>
              <div className="flex gap-2">
                <Button asChild variant="ghost" size="icon" aria-label="GitHub">
                  <a href={SITE.github} target="_blank" rel="noopener noreferrer">
                    <IconGithub className="h-5 w-5" />
                  </a>
                </Button>
                <Button asChild variant="ghost" size="icon" aria-label="LinkedIn">
                  <a href={SITE.linkedin} target="_blank" rel="noopener noreferrer">
                    <IconLinkedin className="h-5 w-5" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2 text-muted-foreground animate-bounce">
        <span className="text-xs font-mono">scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-muted-foreground to-transparent" />
      </div>
    </section>
  );
}
