import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { GraduationCap, Calendar } from 'lucide-react';
import { education } from '../data/resume';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function Education() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.set(headingRef.current, { y: 24 });
    gsap.to(headingRef.current, {
      opacity: 1, visibility: 'inherit', y: 0, duration: 0.6, ease: 'power3.out',
      scrollTrigger: { trigger: sectionRef.current, start: 'top 80%' },
    });
    gsap.set('.edu-card', { y: 30 });
    gsap.to('.edu-card', {
      opacity: 1,
      visibility: 'inherit',
      y: 0,
      duration: 0.7,
      stagger: 0.2,
      ease: 'power3.out',
      scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
    });
  }, { scope: sectionRef });

  return (
    <section id="education" ref={sectionRef} className="py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div ref={headingRef} className="gsap-reveal text-center mb-8">
          <p className="text-sm font-mono text-secondary tracking-widest uppercase mb-2">
            Academic background
          </p>
          <h2 className="text-4xl font-bold mb-4">Education</h2>
          <div className="w-16 h-1 bg-linear-to-r from-primary to-secondary mx-auto rounded-full" />
        </div>

        <div className="grid sm:grid-cols-2 gap-8">
          {education.map((edu) => (
            <div key={`${edu.institution}-${edu.degree}-${edu.dateStart}`} className="gsap-reveal edu-card flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10 text-primary shrink-0">
                <GraduationCap className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">{edu.degree}</h3>
                <p className="text-primary font-medium text-sm">{edu.field}</p>
                <p className="font-medium mt-2 mb-0.5">{edu.institution}</p>
                <p className="text-sm text-muted-foreground">{edu.location}</p>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-2">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  <time dateTime={edu.dateStart}>{edu.period}</time>
                </div>
                {edu.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed mt-3">{edu.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
