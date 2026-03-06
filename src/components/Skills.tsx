'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Badge } from './ui/badge';
import type { IconType } from 'react-icons';
import {
  SiPython, SiCplusplus, SiJavascript, SiTypescript, SiGnubash,
  SiFastapi, SiDocker, SiGithubactions, SiPydantic, SiRos,
  SiPostgresql, SiMongodb, SiSqlite, SiRedis,
  SiLinux, SiPytest, SiGit, SiSelenium,
} from 'react-icons/si';
import { Cpu, Globe, ImageIcon, Dna, CheckCircle2, TestTube2 } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

// Map skill names to icons. Skills without a matching brand icon use a generic Lucide icon.
const skillIcons: Record<string, IconType | React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  'Python': SiPython,
  'C/C++': SiCplusplus,
  'JavaScript': SiJavascript,
  'TypeScript': SiTypescript,
  'Bash': SiGnubash,
  'FastAPI': SiFastapi,
  'Pydantic': SiPydantic,
  'REST API Design': Globe,
  'ROS': SiRos,
  'PostgreSQL': SiPostgresql,
  'MongoDB': SiMongodb,
  'SQLite': SiSqlite,
  'Redis': SiRedis,
  'Docker': SiDocker,
  'GitHub Actions': SiGithubactions,
  'Linux': SiLinux,
  'PyTest': SiPytest,
  'MyPy': CheckCircle2,
  'Git': SiGit,
  'Playwright': TestTube2,
  'Selenium': SiSelenium,
  'IoT & Embedded Systems': Cpu,
  'Bioinformatics': Dna,
  'Image Processing': ImageIcon,
};

interface SkillCategory {
  title: string;
  color: 'default' | 'secondary' | 'amber' | 'rose' | 'indigo' | 'violet';
  skills: string[];
}

const skillCategories: SkillCategory[] = [
  {
    title: 'Programming Languages',
    color: 'default',
    skills: ['Python', 'C/C++', 'JavaScript', 'TypeScript', 'Bash'],
  },
  {
    title: 'Backend Frameworks',
    color: 'secondary',
    skills: ['FastAPI', 'Pydantic', 'REST API Design', 'ROS'],
  },
  {
    title: 'Databases & Caching',
    color: 'amber',
    skills: ['PostgreSQL', 'MongoDB', 'SQLite', 'Redis'],
  },
  {
    title: 'Infrastructure & DevOps',
    color: 'rose',
    skills: ['Docker', 'GitHub Actions', 'Linux'],
  },
  {
    title: 'Testing & Tooling',
    color: 'indigo',
    skills: ['PyTest', 'Playwright', 'Selenium', 'MyPy', 'Git'],
  },
  {
    title: 'Core Domains',
    color: 'violet',
    skills: ['IoT & Embedded Systems', 'Bioinformatics', 'Image Processing'],
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
          {skillCategories.map(({ title, color, skills }, index) => (
            <div
              key={title}
              style={{ opacity: 0 }}
              className={`skill-card p-6 rounded-xl border border-border bg-card hover:border-primary/30 transition-all hover:shadow-md${
                index === skillCategories.length - 1 && skillCategories.length % 2 === 1
                  ? ' sm:col-span-2'
                  : ''
              }`}
                         >
              <h3 className="text-sm font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                {title}
              </h3>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => {
                  const Icon = skillIcons[skill];
                  return (
                    <Badge
                      key={skill}
                      variant={color}
                      className="cursor-default hover:scale-105 transition-transform text-xs gap-1.5"
                    >
                      {Icon && <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />}
                      {skill}
                    </Badge>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
