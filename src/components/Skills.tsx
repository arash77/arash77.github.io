'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Badge } from './ui/badge';

gsap.registerPlugin(ScrollTrigger);

interface SkillCategory {
  title: string;
  color: 'default' | 'secondary' | 'amber' | 'indigo';
  skills: string[];
}

const skillCategories: SkillCategory[] = [
  {
    title: 'Programming Languages',
    color: 'default',
    skills: ['Python', 'C/C++', 'JavaScript', 'TypeScript', 'Bash'],
  },
  {
    title: 'Frameworks & Tools',
    color: 'secondary',
    skills: ['FastAPI', 'Flask', 'Django', 'Docker', 'Kubernetes', 'GitHub Actions', 'ROS', 'Pydantic', 'MyPy'],
  },
  {
    title: 'Databases',
    color: 'amber',
    skills: ['PostgreSQL', 'MongoDB', 'SQLite', 'Redis'],
  },
  {
    title: 'Other Skills',
    color: 'indigo',
    skills: ['IoT & Embedded Systems', 'REST API Design', 'Image Processing', 'Ansible', 'CI/CD Pipelines', 'Bioinformatics Tooling', 'Linux Administration', 'OpenAI API', 'PyTest'],
  },
];

export default function Skills() {
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
      gsap.set('.skill-card', { opacity: 0, y: 30 });
      gsap.to('.skill-card', {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.12,
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
    <section id="skills" ref={sectionRef} className="py-24">
      <div className="container mx-auto px-4 max-w-6xl">
        <div ref={headingRef} className="text-center mb-16" style={{ opacity: 0 }}>
          <p className="text-sm font-mono text-secondary tracking-widest uppercase mb-2">
            What I work with
          </p>
          <h2 className="text-4xl font-bold mb-4">Skills</h2>
          <div className="w-16 h-1 bg-gradient-to-r from-primary to-secondary mx-auto rounded-full" />
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {skillCategories.map(({ title, color, skills }) => (
            <div
              key={title}
              style={{ opacity: 0 }}
              className="skill-card p-6 rounded-xl border border-border bg-card hover:border-primary/30 transition-all hover:shadow-md"
                         >
              <h3 className="text-sm font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                {title}
              </h3>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant={color}
                    className="cursor-default hover:scale-105 transition-transform text-xs"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
