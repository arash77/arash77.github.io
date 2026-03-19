import { describe, it, expect } from 'vitest';
import { z } from 'astro/zod';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Recreate the Zod schema from src/content.config.ts
// (cannot import directly due to 'astro:content' dependency)
const projectSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.enum([
    'Bioinformatics',
    'Python Projects',
    'Galaxy Core',
    'Galaxy Training',
    'UseGalaxy.eu',
    'Python Libraries',
    'Crypto',
    'Other',
  ]),
  links: z.array(
    z.object({
      label: z.string(),
      url: z.string().url(),
    }),
  ),
  tags: z.array(z.string()),
  featured: z.boolean().default(false),
  order: z.number().optional(),
});

const projectsDir = resolve(__dirname, '../../src/content/projects');

function loadProjects() {
  const files = readdirSync(projectsDir).filter((f) => f.endsWith('.json'));
  return files.map((file) => ({
    file,
    data: JSON.parse(readFileSync(resolve(projectsDir, file), 'utf-8')),
  }));
}

describe('Project content files', () => {
  const projects = loadProjects();

  it('finds at least one project file', () => {
    expect(projects.length).toBeGreaterThan(0);
  });

  it('each file parses without Zod errors', () => {
    for (const { file, data } of projects) {
      const result = projectSchema.safeParse(data);
      if (!result.success) {
        throw new Error(`${file}: ${result.error.message}`);
      }
    }
  });

  it('all categories are valid enum values', () => {
    const validCategories = [
      'Bioinformatics',
      'Python Projects',
      'Galaxy Core',
      'Galaxy Training',
      'UseGalaxy.eu',
      'Python Libraries',
      'Crypto',
      'Other',
    ];
    for (const { file, data } of projects) {
      expect(validCategories, `${file} has invalid category`).toContain(data.category);
    }
  });

  it('all link URLs are valid', () => {
    for (const { file, data } of projects) {
      for (const link of data.links ?? []) {
        expect(() => new URL(link.url), `${file}: invalid URL: ${link.url}`).not.toThrow();
      }
    }
  });

  it('at least one project is featured', () => {
    const hasFeatured = projects.some(({ data }) => data.featured === true);
    expect(hasFeatured).toBe(true);
  });

  it('each project has a non-empty title and description', () => {
    for (const { file, data } of projects) {
      expect(typeof data.title, `${file}: missing title`).toBe('string');
      expect(data.title.length, `${file}: empty title`).toBeGreaterThan(0);
      expect(typeof data.description, `${file}: missing description`).toBe('string');
      expect(data.description.length, `${file}: empty description`).toBeGreaterThan(0);
    }
  });
});
