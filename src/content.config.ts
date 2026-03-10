import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const projectsCollection = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/projects' }),
  schema: z.object({
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
      })
    ),
    tags: z.array(z.string()),
    featured: z.boolean().default(false),
    order: z.number().optional(),
  }),
});

export const collections = {
  projects: projectsCollection,
};
