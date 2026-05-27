import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const briefings = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/briefings' }),
  schema: z.object({
    date: z.union([z.string(), z.date()]).transform(v => {
      if (v instanceof Date) return v.toISOString().split('T')[0];
      return String(v);
    }),
    title: z.string(),
    audio: z.string().optional(),
  }),
});

export const collections = { briefings };
