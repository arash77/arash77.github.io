// Single source of truth for all resume data.
// Imported by: Experience.tsx, Education.tsx, Skills.tsx, resume.astro

export interface ExperienceItem {
  role: string;
  company: string;
  location: string;
  period: string;
  dateStart: string; // ISO 8601 for <time datetime="">
  dateEnd: string | null; // null = present
  current?: boolean;
  description: string[];
}

export const experiences: ExperienceItem[] = [
  {
    role: 'Software Engineer',
    company: 'Freiburg University',
    location: 'Freiburg, Germany',
    period: 'Apr 2024 – Present',
    dateStart: '2024-04',
    dateEnd: null,
    current: true,
    description: [
      'Galaxy Project backend: FastAPI, Pydantic, data validation, and open-source contributions across 10+ repositories.',
      'CI/CD pipeline improvements and AI/ML tool integrations.',
    ],
  },
  {
    role: 'Software Engineer',
    company: 'Fraunhofer IIS',
    location: 'Deggendorf, Germany',
    period: 'Feb 2023 – Feb 2024',
    dateStart: '2023-02',
    dateEnd: '2024-02',
    description: [
      'Developed automatic CT scan system using Python and ROS for industrial metrology.',
      'Engineered automated control systems for metrology hardware.',
    ],
  },
  {
    role: 'Working Student – IoT & Embedded Systems',
    company: 'Daneshjookit & DigiSpark',
    location: 'Remote',
    period: 'Oct 2017 – Jan 2021',
    dateStart: '2017-10',
    dateEnd: '2021-01',
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
    dateStart: '2014-01',
    dateEnd: '2017-09',
    description: [
      'Heart rate monitor, GPS tracker, and smart home systems.',
      'End-to-end hardware/software solutions for clients.',
    ],
  },
];

// ─────────────────────────────────────────────────────────────

export interface EducationItem {
  degree: string;
  field: string;
  institution: string;
  location: string;
  period: string;
  dateStart: string;
  dateEnd: string;
  note?: string;
  description?: string;
}

export const education: EducationItem[] = [
  {
    degree: 'Master of Engineering',
    field: 'Mechatronic and Cyber-Physical Systems',
    institution: 'Deggendorf Institute of Technology',
    location: 'Deggendorf, Germany',
    period: '2021 – 2024',
    dateStart: '2021-10',
    dateEnd: '2024-03',
    note: 'Thesis: Automatic CT Scan System with ROS & Python',
    description:
      'Focused on robotics, embedded systems, and industrial automation. Thesis on automatic CT scan system using ROS and Python for Fraunhofer.',
  },
  {
    degree: 'Bachelor of Science',
    field: 'Mechanical Engineering',
    institution: 'University of Kashan',
    location: 'Kashan, Iran',
    period: '2016 – 2021',
    dateStart: '2016-09',
    dateEnd: '2021-07',
    description:
      'Strong foundation in engineering principles, CAD/CAM, thermodynamics, and manufacturing processes.',
  },
];

// ─────────────────────────────────────────────────────────────

export interface SkillCategory {
  title: string;
  color: 'default' | 'secondary' | 'amber' | 'rose' | 'indigo' | 'violet';
  skills: string[];
}

export const skillCategories: SkillCategory[] = [
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

// ─────────────────────────────────────────────────────────────
// Resume sidebar: tiered skills replacing the animated progress bars (C1).
// Tiers communicate real signal without fake percentages.

export interface SkillTier {
  tier: string;
  skills: string[];
}

export const resumeSkillTiers: SkillTier[] = [
  {
    tier: 'Primary',
    skills: ['Python', 'FastAPI', 'Pydantic', 'Docker', 'GitHub Actions', 'PostgreSQL', 'Git'],
  },
  {
    tier: 'Working Knowledge',
    skills: ['TypeScript', 'JavaScript', 'MongoDB', 'Redis', 'PyTest', 'Linux', 'ROS'],
  },
  {
    tier: 'Familiar',
    skills: ['C/C++', 'SQLite', 'Playwright', 'Selenium', 'MyPy'],
  },
];

// ─────────────────────────────────────────────────────────────

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface Language {
  name: string;
  cefr: CefrLevel;
  label: string;
}

export const languages: Language[] = [
  { name: 'Persian', cefr: 'C2', label: 'Native' },
  { name: 'English', cefr: 'C1', label: 'Professional' },
  { name: 'German', cefr: 'B1', label: 'Intermediate' },
];

// ─────────────────────────────────────────────────────────────

export interface Doi {
  label: string;
  href: string;
}

export interface Conference {
  title: string;
  year: string;
  types: string[];
  dois: Doi[];
  contributors: string[];
}

export const conferences: Conference[] = [
  {
    title: 'Serving locally hosted LLMs with Galaxy',
    year: '2025',
    types: ['Presentation'],
    dois: [
      { label: '10.7490/F1000RESEARCH.1120343.1', href: 'https://doi.org/10.7490/f1000research.1120343.1' },
    ],
    contributors: ['Arash Kadkhodaei'],
  },
  {
    title: 'Simple and secure credential handling for tools in Galaxy',
    year: '2025',
    types: ['Presentation'],
    dois: [
      { label: '10.7490/F1000RESEARCH.1120347.1', href: 'https://doi.org/10.7490/f1000research.1120347.1' },
    ],
    contributors: ['Alireza Heidari', 'Arash Kadkhodaei', 'David Lopez', 'Bjoern Gruening'],
  },
  {
    title: 'Community-driven standards development for reference genome generation',
    year: '2024',
    types: ['Presentation', 'Poster'],
    dois: [
      { label: '10.7490/F1000RESEARCH.1119773.1', href: 'https://doi.org/10.7490/f1000research.1119773.1' },
      { label: '10.7490/F1000RESEARCH.1119761.1', href: 'https://doi.org/10.7490/f1000research.1119761.1' },
    ],
    contributors: [
      'Tom Brown', 'Diego De Panis', 'Romane Libouban', 'Saim Momin', 'Arash Kadkhodaei',
      'Anthony Bretaudeau', 'Björn Grüning', 'Camila Mazzoni',
    ],
  },
  {
    title: 'Galaxy social',
    year: '2024',
    types: ['Presentation', 'Poster'],
    dois: [
      { label: '10.7490/F1000RESEARCH.1119787.1', href: 'https://doi.org/10.7490/f1000research.1119787.1' },
      { label: '10.7490/F1000RESEARCH.1119786.1', href: 'https://doi.org/10.7490/f1000research.1119786.1' },
    ],
    contributors: ['Arash Kadkhodaei'],
  },
];
