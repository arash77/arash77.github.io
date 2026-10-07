import { ArrowRight, Download } from 'lucide-react';
import { IconGithub, IconLinkedin } from './BrandIcons';
import { Button } from './ui/button';
import { SITE } from '@/lib/utils';

interface Props {
  /** The avatar, sized and encoded at build time (index.astro). */
  avatar: { src: string; srcSet: string };
}

export default function Hero({ avatar }: Props) {
  return (
    <section
      data-thread-section="hero"
      className="relative min-h-screen flex items-center justify-center overflow-hidden supports-[overflow:clip]:overflow-clip gradient-mesh pt-16"
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
          <div data-hero-intro="avatar" data-thread-avatar className="gsap-reveal relative shrink-0">
            <div className="relative">
              <div className="relative rounded-full border-4 border-background shadow-xl ring-1 ring-border/50 w-44 h-44 lg:w-56 lg:h-56 overflow-hidden">
                <img
                  src={avatar.src}
                  srcSet={avatar.srcSet}
                  sizes="(min-width: 1024px) 392px, 308px"
                  alt={SITE.name}
                  width={220}
                  height={220}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: '81% 26%', transform: 'scale(1.75)', transformOrigin: '81% 26%' }}
                  loading="eager"
                  fetchPriority="high"
                />
              </div>
            </div>
          </div>

          {/* Text content */}
          <div className="flex-1 text-center lg:text-left">
            <p data-hero-intro="hello" className="gsap-reveal text-sm font-mono text-secondary mb-3 tracking-widest uppercase">
              Hello, I'm
            </p>
            <h1
              data-hero-intro="name"
              className="gsap-reveal text-5xl lg:text-7xl font-bold tracking-tight mb-4"
            >
              Arash <span className="bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent">Kadkhodaei</span>
            </h1>
            <p
              data-hero-intro="subtitle"
              className="gsap-reveal text-xl lg:text-2xl text-muted-foreground mb-6 max-w-xl mx-auto lg:mx-0"
            >
              Software Engineer specialising in <span className="text-foreground font-medium">Backend & Distributed Systems</span>
            </p>

            {/* Tags */}
            <div data-hero-intro="tags" data-thread-beads className="gsap-reveal flex flex-wrap gap-2 justify-center lg:justify-start mb-8">
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
              data-hero-intro="cta"
              className="gsap-reveal flex flex-col sm:flex-row flex-wrap items-center gap-4 justify-center lg:justify-start"
            >
              <Button asChild size="lg" className="gap-2 w-full sm:w-auto">
                <a href="/projects/">
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
      <div data-thread-hint className="absolute bottom-8 inset-x-0 hidden [@media(min-width:640px)_and_(min-height:44rem)]:flex flex-col items-center gap-2 text-muted-foreground animate-bounce">
        <span className="text-xs font-mono">scroll</span>
        <div className="w-px h-8 bg-linear-to-b from-muted-foreground to-transparent" />
      </div>
    </section>
  );
}
