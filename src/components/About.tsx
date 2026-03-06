'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MapPin, Briefcase, GraduationCap, Heart } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const facts = [
  { icon: MapPin, label: 'Location', value: 'Freiburg, Germany' },
  { icon: Briefcase, label: 'Current Role', value: 'Software Engineer @ Freiburg Uni' },
  { icon: GraduationCap, label: 'Education', value: 'M.Eng Mechatronic & Cyber-Physical Systems, DIT' },
  { icon: Heart, label: 'Interests', value: 'IoT, Open Source, Movies' },
];

export default function About() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      gsap.set('.about-content', { y: 40 });
      gsap.to('.about-content', {
        opacity: 1,
        visibility: 'inherit',
        y: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 80%',
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section id="about" ref={sectionRef} className="py-12 bg-muted/30">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="gsap-reveal about-content text-center mb-8">
          <p className="text-sm font-mono text-secondary tracking-widest uppercase mb-2">
            Get to know me
          </p>
          <h2 className="text-4xl font-bold mb-4">About Me</h2>
          <div className="w-16 h-1 bg-gradient-to-r from-primary to-secondary mx-auto rounded-full" />
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Bio */}
          <div className="gsap-reveal about-content space-y-6">
            <p className="text-lg text-muted-foreground leading-relaxed">
              I'm a Software Engineer with expertise in Python, backend development, and a strong
              background in Mechatronics and embedded systems. Currently working at{' '}
              <strong className="text-foreground">Freiburg University</strong> on the{' '}
              <strong className="text-foreground">Galaxy Project</strong>, a leading scientific
              workflow platform.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              My journey spans from Arduino prototypes to cloud-scale bioinformatics tools. I
              believe in clean code, great documentation, and always pushing the open-source
              ecosystem forward.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Outside of work, I enjoy learning German, watching movies, and tinkering with IoT
              projects.
            </p>
          </div>

          {/* Facts — no card borders, use icon + label typography */}
          <div className="gsap-reveal about-content grid grid-cols-1 sm:grid-cols-2 gap-5">
            {facts.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    {label}
                  </p>
                  <p className="font-medium text-sm">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
