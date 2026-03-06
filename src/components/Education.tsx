'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GraduationCap, Calendar } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

interface EducationItem {
  degree: string;
  field: string;
  institution: string;
  location: string;
  period: string;
  description?: string;
}

const education: EducationItem[] = [
  {
    degree: 'Master of Engineering',
    field: 'Mechatronic and Cyber-Physical Systems',
    institution: 'Deggendorf Institute of Technology',
    location: 'Deggendorf, Germany',
    period: '2021 – 2024',
    description:
      'Focused on robotics, embedded systems, and industrial automation. Thesis on automatic CT scan system using ROS and Python for Fraunhofer.',
  },
  {
    degree: 'Bachelor of Science',
    field: 'Mechanical Engineering',
    institution: 'University of Kashan',
    location: 'Kashan, Iran',
    period: '2016 – 2021',
    description:
      'Strong foundation in engineering principles, CAD/CAM, thermodynamics, and manufacturing processes.',
  },
];

export default function Education() {
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
      gsap.set('.edu-card', { opacity: 0, y: 30 });
      gsap.to('.edu-card', {
        opacity: 1,
        y: 0,
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
    <section id="education" ref={sectionRef} className="py-24">
      <div className="container mx-auto px-4 max-w-4xl">
        <div ref={headingRef} className="text-center mb-16" style={{ opacity: 0 }}>
          <p className="text-sm font-mono text-secondary tracking-widest uppercase mb-2">
            Academic background
          </p>
          <h2 className="text-4xl font-bold mb-4">Education</h2>
          <div className="w-16 h-1 bg-gradient-to-r from-primary to-secondary mx-auto rounded-full" />
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {education.map((edu, idx) => (
            <div
              key={idx}
              style={{ opacity: 0 }}
              className="edu-card rounded-xl border border-border bg-card p-6 hover:border-primary/30 transition-all hover:shadow-md"
                         >
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">{edu.degree}</h3>
                  <p className="text-primary font-medium text-sm">{edu.field}</p>
                </div>
              </div>
              <p className="font-medium mb-1">{edu.institution}</p>
              <p className="text-sm text-muted-foreground mb-3">{edu.location}</p>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
                <Calendar className="h-3.5 w-3.5" />
                {edu.period}
              </div>
              {edu.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{edu.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
