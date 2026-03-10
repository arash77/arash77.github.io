import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Badge } from './ui/badge';
import type { IconType } from 'react-icons';
import {
  SiPython, SiCplusplus, SiJavascript, SiTypescript, SiGnubash,
  SiFastapi, SiDocker, SiGithubactions, SiPydantic, SiRos,
  SiPostgresql, SiMongodb, SiSqlite, SiRedis,
  SiLinux, SiPytest, SiGit, SiSelenium,
} from 'react-icons/si';
import { Cpu, Globe, ImageIcon, Dna, CheckCircle2, TestTube2 } from 'lucide-react';
import { skillCategories } from '../data/resume';

gsap.registerPlugin(ScrollTrigger, useGSAP);

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

export default function Skills() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.set(headingRef.current, { y: 24 });
    gsap.to(headingRef.current, {
      opacity: 1, visibility: 'inherit', y: 0, duration: 0.6, ease: 'power3.out',
      scrollTrigger: { trigger: sectionRef.current, start: 'top 80%' },
    });
    gsap.set('.skill-card', { y: 30 });
    gsap.to('.skill-card', {
      opacity: 1,
      visibility: 'inherit',
      y: 0,
      duration: 0.6,
      stagger: 0.12,
      ease: 'power3.out',
      scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
    });
  }, { scope: sectionRef });

  return (
    <section id="skills" ref={sectionRef} className="py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div ref={headingRef} className="gsap-reveal text-center mb-8">
          <p className="text-sm font-mono text-secondary tracking-widest uppercase mb-2">
            What I work with
          </p>
          <h2 className="text-4xl font-bold mb-4">Skills</h2>
          <div className="w-16 h-1 bg-linear-to-r from-primary to-secondary mx-auto rounded-full" />
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {skillCategories.map(({ title, color, skills }, index) => (
            <div
              key={title}
              className={`gsap-reveal skill-card p-6 rounded-xl border border-border bg-card hover:border-primary/30 transition-[border-color,box-shadow] duration-150 hover:shadow-md${
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
                      className="cursor-default hover:brightness-110 transition-[filter] text-xs gap-1.5"
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
