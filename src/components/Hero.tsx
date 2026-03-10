import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowRight, Download } from 'lucide-react';
import { IconGithub, IconLinkedin } from './BrandIcons';
import { Button } from './ui/button';
import { SITE } from '@/lib/utils';

gsap.registerPlugin(useGSAP);

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const helloRef = useRef<HTMLParagraphElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.set(imageRef.current, { scale: 0.8 });
    gsap.set([helloRef.current, tagsRef.current], { y: 15 });
    gsap.set(nameRef.current, { y: 30 });
    gsap.set([subtitleRef.current, ctaRef.current], { y: 20 });

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.to(imageRef.current, { opacity: 1, visibility: 'inherit', scale: 1, duration: 0.8 })
      .to(helloRef.current, { opacity: 1, visibility: 'inherit', y: 0, duration: 0.5 }, '-=0.4')
      .to(nameRef.current, { opacity: 1, visibility: 'inherit', y: 0, duration: 0.7 }, '-=0.4')
      .to(subtitleRef.current, { opacity: 1, visibility: 'inherit', y: 0, duration: 0.6 }, '-=0.3')
      .to(tagsRef.current, { opacity: 1, visibility: 'inherit', y: 0, duration: 0.5 }, '-=0.2')
      .to(ctaRef.current, { opacity: 1, visibility: 'inherit', y: 0, duration: 0.6 }, '-=0.2');
  }, { scope: containerRef });

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
          <div ref={imageRef} className="gsap-reveal relative shrink-0">
            <div className="relative">
              <div className="relative rounded-full border-4 border-background shadow-xl ring-1 ring-border/50 w-44 h-44 lg:w-56 lg:h-56 overflow-hidden">
                <img
                  src={SITE.avatar}
                  alt={SITE.name}
                  width={220}
                  height={220}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: '81% 26%', transform: 'scale(1.75)', transformOrigin: '81% 26%' }}
                  loading="eager"
                />
              </div>
            </div>
          </div>

          {/* Text content */}
          <div className="flex-1 text-center lg:text-left">
            <p ref={helloRef} className="gsap-reveal text-sm font-mono text-secondary mb-3 tracking-widest uppercase">
              Hello, I'm
            </p>
            <h1
              ref={nameRef}
              className="gsap-reveal text-5xl lg:text-7xl font-bold tracking-tight mb-4"
            >
              Arash <span className="bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent">Kadkhodaei</span>
            </h1>
            <p
              ref={subtitleRef}
              className="gsap-reveal text-xl lg:text-2xl text-muted-foreground mb-6 max-w-xl mx-auto lg:mx-0"
            >
              Software Engineer specialising in <span className="text-foreground font-medium">Backend & Distributed Systems</span>
            </p>

            {/* Tags */}
            <div ref={tagsRef} className="gsap-reveal flex flex-wrap gap-2 justify-center lg:justify-start mb-8">
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
              className="gsap-reveal flex flex-col sm:flex-row flex-wrap items-center gap-4 justify-center lg:justify-start"
            >
              <Button asChild size="lg" className="gap-2 w-full sm:w-auto">
                <a href="/projects">
                  View Projects <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="gap-2 w-full sm:w-auto">
                <a href="/assets/resume.pdf" download>
                  Download Resume <Download className="h-4 w-4" />
                </a>
              </Button>
              <div className="hidden sm:block w-px h-6 bg-border" aria-hidden="true" />
              <div className="flex items-center gap-1">
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
      <div className="absolute bottom-8 inset-x-0 hidden sm:flex flex-col items-center gap-2 text-muted-foreground animate-bounce">
        <span className="text-xs font-mono">scroll</span>
        <div className="w-px h-8 bg-linear-to-b from-muted-foreground to-transparent" />
      </div>
    </section>
  );
}
