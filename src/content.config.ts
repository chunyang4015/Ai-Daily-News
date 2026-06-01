import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ base: './src/data/news', pattern: '**/*.json' }),
  schema: z.object({
    date: z.string(),
    lastUpdate: z.string(),
    stories: z.array(z.object({
      id: z.number(),
      title: z.string(),
      titleCN: z.string().optional(),
      url: z.string(),
      source: z.string(),
      sourceIcon: z.string(),
      pubDate: z.string(),
      summary: z.string(),
    })),
  }),
});

export const collections = { news };
