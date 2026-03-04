import { defineCollection, z } from 'astro:content';

const projectsCollection = defineCollection({
  type: 'data',
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
