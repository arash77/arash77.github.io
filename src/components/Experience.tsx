import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Briefcase, Calendar } from 'lucide-react';
import { experiences } from '../data/resume';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function Experience() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.set(headingRef.current, { y: 24 });
    gsap.to(headingRef.current, {
      opacity: 1, visibility: 'inherit', y: 0, duration: 0.6, ease: 'power3.out',
      scrollTrigger: { trigger: sectionRef.current, start: 'top 80%' },
    });
    gsap.set('.timeline-card', { x: -40 });
    gsap.to('.timeline-card', {
      opacity: 1,
      visibility: 'inherit',
      x: 0,
      duration: 0.7,
      stagger: 0.2,
      ease: 'power3.out',
      scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
    });
  }, { scope: sectionRef });

  return (
    <section id="experience" ref={sectionRef} className="py-12 bg-muted/30">
      <div className="container mx-auto px-4 max-w-5xl">
        <div ref={headingRef} className="gsap-reveal text-center mb-8">
          <p className="text-sm font-mono text-secondary tracking-widest uppercase mb-2">
            My journey
          </p>
          <h2 className="text-4xl font-bold mb-4">Experience</h2>
          <div className="w-16 h-1 bg-linear-to-r from-primary to-secondary mx-auto rounded-full" />
        </div>

        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-border hidden sm:block" aria-hidden="true" />

          <div className="space-y-8">
            {experiences.map((exp) => (
              <div key={`${exp.company}-${exp.role}-${exp.dateStart}`} className="gsap-reveal timeline-card relative flex gap-6">
                <div className="hidden sm:flex flex-col items-center shrink-0">
                  <div
                    className={`w-12 h-12 rounded-full border-2 flex items-center justify-center z-10 ${
                      exp.current
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    <Briefcase className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>

                <div className="flex-1 pb-2 pt-1">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <div>
                      <h3 className="text-lg font-semibold">{exp.role}</h3>
                      <p className="text-primary font-medium">{exp.company}</p>
                      <p className="text-sm text-muted-foreground">{exp.location}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted rounded-full px-3 py-1 whitespace-nowrap">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      <time dateTime={exp.dateStart}>{exp.period}</time>
                      {exp.current && (
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" />
                      )}
                    </div>
                  </div>
                  <ul className="space-y-1.5">
                    {exp.description.map((point, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex gap-2">
                        <span className="text-primary mt-1.5 shrink-0" aria-hidden="true">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
