'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Briefcase, Calendar } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

interface ExperienceItem {
  role: string;
  company: string;
  location: string;
  period: string;
  description: string[];
  current?: boolean;
}

const experiences: ExperienceItem[] = [
  {
    role: 'Software Engineer',
    company: 'Freiburg University',
    location: 'Freiburg, Germany',
    period: 'Apr 2024 – Present',
    current: true,
    description: [
      'Working on the Galaxy Project, improving backend systems and APIs.',
      'Special focus on FastAPI, Pydantic, and data validation.',
      'Open-source contributions across Galaxy ecosystem repositories.',
    ],
  },
  {
    role: 'Software Engineer',
    company: 'Fraunhofer IIS',
    location: 'Deggendorf, Germany',
    period: 'Feb 2023 – Feb 2024',
    description: [
      'Developed automatic fast CT scan system using Python and ROS for industrial metrology.',
      'Engineered automated control systems for metrology hardware.',
      'Integrated Python image processing pipelines with robotic control.',
    ],
  },
  {
    role: 'Working Student – IoT & Embedded Systems',
    company: 'Daneshjookit & DigiSpark',
    location: 'Remote',
    period: 'Oct 2017 – Jan 2021',
    description: [
      'Designed IoT and embedded systems projects.',
      'Authored technical content on IoT and embedded systems topics.',
    ],
  },
  {
    role: 'Arduino Freelancer Developer',
    company: 'Freelance',
    location: 'Remote',
    period: 'Jan 2014 – Sep 2017',
    description: [
      'Created innovative projects: heart rate monitor, GPS tracker, smart home systems.',
      'Built end-to-end hardware/software solutions for clients.',
    ],
  },
];

export default function Experience() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      gsap.set(headingRef.current, { opacity: 0, y: 24 });
      gsap.to(headingRef.current, {
        opacity: 1, y: 0, duration: 0.6, ease: 'power3.out',
        scrollTrigger: { trigger: sectionRef.current, start: 'top 80%' },
      });
      gsap.set('.timeline-card', { opacity: 0, x: -40 });
      gsap.to('.timeline-card', {
        opacity: 1,
        x: 0,
        duration: 0.7,
        stagger: 0.2,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 75%',
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section id="experience" ref={sectionRef} className="py-24 bg-muted/30">
      <div className="container mx-auto px-4 max-w-4xl">
        <div ref={headingRef} className="text-center mb-16" style={{ opacity: 0 }}>
          <p className="text-sm font-mono text-secondary tracking-widest uppercase mb-2">
            My journey
          </p>
          <h2 className="text-4xl font-bold mb-4">Experience</h2>
          <div className="w-16 h-1 bg-gradient-to-r from-primary to-secondary mx-auto rounded-full" />
        </div>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-border hidden sm:block" aria-hidden="true" />

          <div className="space-y-8">
            {experiences.map((exp, idx) => (
              <div
                key={idx}
                style={{ opacity: 0 }}
                className="timeline-card relative flex gap-6"
                             >
                {/* Icon dot */}
                <div className="hidden sm:flex flex-col items-center flex-shrink-0">
                  <div
                    className={`w-12 h-12 rounded-full border-2 flex items-center justify-center z-10 ${
                      exp.current
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    <Briefcase className="h-5 w-5" />
                  </div>
                </div>

                {/* Card */}
                <div className="flex-1 pb-2">
                  <div className="rounded-xl border border-border bg-card p-6 hover:border-primary/30 transition-colors hover:shadow-md">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-lg font-semibold">{exp.role}</h3>
                        <p className="text-primary font-medium">{exp.company}</p>
                        <p className="text-sm text-muted-foreground">{exp.location}</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted rounded-full px-3 py-1 whitespace-nowrap">
                        <Calendar className="h-3.5 w-3.5" />
                        {exp.period}
                        {exp.current && (
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" />
                        )}
                      </div>
                    </div>
                    <ul className="space-y-1.5">
                      {exp.description.map((point, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex gap-2">
                          <span className="text-primary mt-1.5 flex-shrink-0">•</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
