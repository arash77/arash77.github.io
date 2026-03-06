'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface SkillBarProps {
  name: string;
  level: number; // 0-100
}

export function SkillBar({ name, level }: SkillBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      if (fillRef.current) fillRef.current.style.width = `${level}%`;
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        fillRef.current,
        { width: '0%' },
        {
          width: `${level}%`,
          duration: 1.2,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: barRef.current,
            start: 'top 90%',
          },
        }
      );
    });

    return () => ctx.revert();
  }, [level]);

  return (
    <div ref={barRef} className="mb-4">
      <div className="flex justify-between mb-1.5">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs font-mono text-muted-foreground">{level}%</span>
      </div>
      <div
        className="h-2 bg-muted rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={level}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={name}
      >
        <div
          ref={fillRef}
          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
          style={{ width: 0 }}
        />
      </div>
    </div>
  );
}

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type CefrLevel = (typeof CEFR_ORDER)[number];

interface LanguageRingProps {
  name: string;
  cefr: CefrLevel;
  label: string;
}

export function LanguageRing({ name, cefr, label }: LanguageRingProps) {
  const filledCount = CEFR_ORDER.indexOf(cefr) + 1;
  const pipRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      const filledPips = pipRefs.current.filter((_, i) => i < filledCount);
      gsap.set(filledPips, { scaleX: 0, opacity: 0 });
      gsap.to(filledPips, {
        scaleX: 1,
        opacity: 1,
        duration: 0.35,
        ease: 'power2.out',
        stagger: 0.07,
        scrollTrigger: {
          trigger: pipRefs.current[0],
          start: 'top 92%',
        },
      });
    });

    return () => ctx.revert();
  }, [filledCount]);

  return (
    <div className="w-full py-1.5">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-semibold text-sm">{name}</span>
        <span className="text-xs font-mono flex items-center gap-1.5">
          <span className="font-bold text-primary">{cefr}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{label}</span>
        </span>
      </div>
      <div className="flex gap-1 w-full">
        {CEFR_ORDER.map((lvl, i) => (
          <div
            key={lvl}
            ref={(el) => { pipRefs.current[i] = el; }}
            title={lvl}
            style={i < filledCount ? { transformOrigin: 'left center' } : undefined}
            className={`flex-1 h-1.5 rounded-full ${
              i < filledCount ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
