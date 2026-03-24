import { describe, it, expect } from 'vitest';
import {
  experiences,
  education,
  skillCategories,
  resumeSkillTiers,
  conferences,
} from '@/data/resume';

describe('experiences', () => {
  it('is non-empty', () => {
    expect(experiences.length).toBeGreaterThan(0);
  });

  it('each entry has role, company, and dateStart', () => {
    for (const exp of experiences) {
      expect(exp.role).toBeTruthy();
      expect(exp.company).toBeTruthy();
      expect(exp.dateStart).toBeTruthy();
    }
  });

  it('has at least one current position (dateEnd is null)', () => {
    const current = experiences.filter((e) => e.dateEnd === null || e.dateEnd === undefined);
    expect(current.length).toBeGreaterThan(0);
  });
});

describe('education', () => {
  it('is non-empty', () => {
    expect(education.length).toBeGreaterThan(0);
  });

  it('each entry has dateStart and dateEnd', () => {
    for (const edu of education) {
      expect(edu.dateStart).toBeTruthy();
      expect(edu.dateEnd).toBeTruthy();
    }
  });

  it('each entry has degree and institution', () => {
    for (const edu of education) {
      expect(edu.degree).toBeTruthy();
      expect(edu.institution).toBeTruthy();
    }
  });
});

describe('skillCategories', () => {
  it('has 5 or more categories', () => {
    expect(skillCategories.length).toBeGreaterThanOrEqual(5);
  });

  it('each category has a title and non-empty skills array', () => {
    for (const cat of skillCategories) {
      expect(cat.title).toBeTruthy();
      expect(cat.skills.length).toBeGreaterThan(0);
    }
  });
});

describe('conferences', () => {
  it('is non-empty', () => {
    expect(conferences.length).toBeGreaterThan(0);
  });

  it('each conference has a valid DOI URL', () => {
    for (const conf of conferences) {
      for (const doi of conf.dois) {
        expect(() => new URL(doi.href)).not.toThrow();
        expect(doi.href).toMatch(/^https?:\/\//);
      }
    }
  });

  it('each conference has a title and year', () => {
    for (const conf of conferences) {
      expect(conf.title).toBeTruthy();
      expect(conf.year).toBeTruthy();
    }
  });
});

describe('resumeSkillTiers', () => {
  it('has exactly 3 tiers', () => {
    expect(resumeSkillTiers).toHaveLength(3);
  });

  it('each tier has a name and non-empty skills', () => {
    for (const tier of resumeSkillTiers) {
      expect(tier.tier).toBeTruthy();
      expect(tier.skills.length).toBeGreaterThan(0);
    }
  });
});
