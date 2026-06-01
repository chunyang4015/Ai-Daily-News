import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const allNews = await getCollection('news');
  const sorted = allNews.sort((a, b) => b.data.date.localeCompare(a.data.date));
  const latest = sorted[0];

  if (!latest || !context.site) {
    return new Response('No data', { status: 404 });
  }

  return rss({
    title: 'AI Daily — 每日 AI 资讯',
    description: '每日 AI 资讯聚合，涵盖人工智能、大模型、科技前沿动态。',
    site: context.site,
    items: latest.data.stories.map((story) => ({
      title: `${String(story.id).padStart(2, '0')} ${story.titleCN || story.summary}`,
      pubDate: new Date(story.pubDate),
      link: story.url,
      description: `${story.summary}\n\n${story.title} — ${story.source}`,
    })),
    customData: '<language>zh-cn</language>',
  });
}
