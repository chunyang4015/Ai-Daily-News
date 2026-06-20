import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import Parser from 'rss-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../src/data/news');

interface Story {
  id: number;
  title: string;
  titleCN: string;
  url: string;
  source: string;
  sourceIcon: string;
  pubDate: string;
  summary: string;
}

interface RawItem {
  title: string;
  url: string;
  pubDate: string;
  score: number;
  source?: string;
  sourceIcon?: string;
}

interface DailyData {
  date: string;
  lastUpdate: string;
  stories: Story[];
}

const AI_KEYWORDS =
  /\b(AI|LLM|GPT|Claude|OpenAI|Gemini|DeepSeek|Anthropic|machine.?learning|deep.?learning|neural|transformer|AGI|Mistral|Llama|ChatGPT|Copilot|Sora|Midjourney|Stable.?Diffusion|AIGC|generative.?AI)\b/i;

// ── Hacker News ──────────────────────────────────────────

async function fetchHackerNews(): Promise<RawItem[]> {
  try {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const ids: number[] = await res.json();

    const items = await Promise.all(
      ids.slice(0, 200).map(async (id) => {
        try {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          return r.json();
        } catch {
          return null;
        }
      }),
    );

    return items
      .filter((item): item is { title: string; url: string; time: number; score: number } =>
        item != null && item.title && item.url && AI_KEYWORDS.test(item.title))
      .map((item) => ({
        title: item.title,
        url: item.url,
        pubDate: new Date(item.time * 1000).toISOString(),
        score: item.score || 0,
      }));
  } catch (err) {
    console.error('Hacker News fetch failed:', (err as Error).message);
    return [];
  }
}

// ── The Rundown AI ────────────────────────────────────────

function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchTheRundownAI(): Promise<RawItem[]> {
  const all: RawItem[] = [];
  try {
    const res = await fetch('https://www.therundown.ai/sitemap.xml', {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>(https:\/\/www\.therundown\.ai\/p\/([^<]+))<\/loc>/g)];

    // Take latest 10 articles from sitemap, convert slug to title
    const recent = urls.slice(0, 10);
    const today = new Date();

    for (const [, articleUrl, slug] of recent) {
      const title = slugToTitle(slug);
      if (AI_KEYWORDS.test(title)) {
        all.push({ title, url: articleUrl, pubDate: today.toISOString(), score: 50 });
      }
    }
  } catch (err) {
    console.error('The Rundown AI fetch failed:', (err as Error).message);
  }
  return all;
}

// ── TLDR AI ───────────────────────────────────────────────

async function fetchTLDR(): Promise<RawItem[]> {
  const all: RawItem[] = [];
  const today = new Date();

  for (let offset = 0; offset < 3; offset++) {
    const d = new Date(today.getTime() - offset * 86400_000);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const pageUrl = `https://tldr.tech/tech/${dateStr}`;

    try {
      const res = await fetch(pageUrl, {
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ai-daily-news/1.0)' },
      });
      if (!res.ok) continue;
      const html = await res.text();

      // TLDR puts titles in <h3> without links; skip section headers and sponsors
      const h3Matches = html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g);
      for (const h3Match of h3Matches) {
        const rawTitle = h3Match[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&#x27;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/\s*\(?\d+\s*minute\s*read\)?\s*/gi, '')
          .replace(/\s*\(Sponsor\)\s*/gi, '')
          .replace(/\s*\(Website\)\s*/gi, '')
          .trim();

        if (rawTitle.length > 15 && AI_KEYWORDS.test(rawTitle)) {
          all.push({ title: rawTitle, url: pageUrl, pubDate: d.toISOString(), score: 30 });
        }
      }
    } catch (err) {
      console.error(`TLDR ${dateStr} fetch failed:`, (err as Error).message);
    }
  }

  return all;
}

// ── Generic RSS ──────────────────────────────────────────

const RSS_FEEDS = [
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', name: 'TechCrunch' },
  { url: 'https://hnrss.org/newest?q=AI', name: 'HN RSS' },
  { url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', name: 'The Verge' },
  { url: 'https://venturebeat.com/category/ai/feed/', name: 'VentureBeat' },
  { url: 'https://www.producthunt.com/feed', name: 'Product Hunt' },
];

async function fetchRSSFeeds(): Promise<RawItem[]> {
  const parser = new Parser();
  const all: RawItem[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items) {
        if (item.link && AI_KEYWORDS.test(item.title || '')) {
          all.push({
            title: item.title || '',
            url: item.link,
            pubDate: item.isoDate || new Date().toISOString(),
            score: 20,
            source: feed.name,
          });
        }
      }
    } catch (err) {
      console.error(`${feed.name} RSS fetch failed:`, (err as Error).message);
    }
  }

  return all;
}

// ── Dedup ────────────────────────────────────────────────

function dedup(items: RawItem[]): RawItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = new URL(item.url).hostname + new URL(item.url).pathname;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Filter out stories older than maxAgeHours
function filterByRecency(items: RawItem[], maxAgeHours: number): RawItem[] {
  const cutoff = Date.now() - maxAgeHours * 3600_000;
  return items.filter((item) => new Date(item.pubDate).getTime() >= cutoff);
}

// Pick top stories with source diversity: sort by score, then ensure no single source dominates
function selectTopStories(items: RawItem[], total: number, maxPerSource: number): RawItem[] {
  // Sort by score descending (HN score >> Rundown 50 >> TLDR 30 >> RSS 20)
  const sorted = [...items].sort((a, b) => b.score - a.score);

  const selected: RawItem[] = [];
  const sourceCount = new Map<string, number>();

  for (const item of sorted) {
    if (selected.length >= total) break;
    const src = item.source || item.sourceIcon || 'unknown';
    const count = sourceCount.get(src) || 0;
    if (count >= maxPerSource) continue;
    selected.push(item);
    sourceCount.set(src, count + 1);
  }

  return selected;
}

// ── AI Summary ───────────────────────────────────────────

function createAIClient(): { client: OpenAI; model: string } {
  const provider = process.env.AI_PROVIDER || 'omlx';

  if (provider === 'omlx') {
    return {
      client: new OpenAI({
        apiKey: 'omlx',
        baseURL: process.env.OMLX_BASE_URL || 'http://localhost:8000/v1',
        timeout: 120_000,
      }),
      model: process.env.OMLX_MODEL || 'gemma-4-26B-A4B-it-OptiQ-4bit',
    };
  }

  if (provider === 'agnes') {
    return {
      client: new OpenAI({
        apiKey: process.env.AGNES_API_KEY,
        baseURL: process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1',
        timeout: 120_000,
      }),
      model: process.env.AGNES_MODEL || 'agnes-1.5-flash',
    };
  }

  return {
    client: new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
    }),
    model: 'deepseek-chat',
  };
}


interface AIGenerated {
  titleCN: string;
  summary: string;
}

const SYSTEM_PROMPT = `你是一个顶级科技自媒体编辑，风格类似 36氪、量子位的热门文章，擅长写出让人忍不住点进来的 AI 新闻标题和摘要。

用户会给你一条英文 AI 新闻标题和来源。你需要：

1. 生成中文标题（不超过 40 字），要求：
   - 必须忠实原文事实，不得捏造原文没有的信息（如虚假的漏洞、安全事件、金额等）
   - 必须包含关键人名或公司名（如 Karpathy、OpenAI、Google、Anthropic、Nvidia 等）
   - 突出冲突、反转、突破、争议等戏剧性元素（但仅限原文已有的信息）
   - 用数据说话：金额、百分比、对比数字让标题更有冲击力
   - 适当使用热门表达：变天、炸裂、碾压、暴降、翻车、洗牌、颠覆等
   - 像科技自媒体热搜标题，有信息量和情绪张力，拒绝平淡直译
   - 好例子：「Anthropic 首次碾压 OpenAI，Claude 新模型多项评测登顶，AI 格局一夜变天」
   - 好例子：「Token 成本暴降 91.8%，开源工具 Lowfat 让大模型调用费用直逼地板价」
   - 坏例子：「Anthropic 发布了新模型，性能有所提升」

2. 生成中文摘要（40-60 字），要求：
   - 补充标题没说清的关键细节：具体数据、影响范围、行业反应
   - 有具体信息点，不要空泛概括
   - 带观点和判断，不要纯陈述
   - 好例子：「Gemini 3.5 Flash 推理能力首次对标 Claude 和 GPT，成本骤降 3 倍，但实测显示部分场景费用不降反升，业内质疑 Google 定价策略。」
   - 坏例子：「Google 发布了新一代 AI 模型，性能有所提升。」

严格按 JSON 格式输出，不要输出任何其他内容，title 与 summary 字段中不要包含 JSON 格式数据：
{"title":"中文标题","summary":"中文摘要"}`;

function containsChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

function parseAIResponse(raw: string): AIGenerated | null {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  const tryParse = (text: string): AIGenerated | null => {
    try {
      const parsed = JSON.parse(text);
      if (parsed.title && parsed.summary) {
        const result = { titleCN: parsed.title, summary: parsed.summary };
        // Validate: both fields must contain Chinese characters
        if (containsChinese(result.titleCN) && containsChinese(result.summary)) {
          return result;
        }
      }
      // Handle {"content": "{\"title\":...,\"summary\":...}"} envelope
      if (parsed.content && typeof parsed.content === 'string') {
        return tryParse(parsed.content);
      }
    } catch { /* fall through */ }
    return null;
  };

  // Direct parse
  const direct = tryParse(cleaned);
  if (direct) return direct;

  // Extract JSON from surrounding text
  const match = cleaned.match(/\{[\s\S]*"title"[\s\S]*"summary"[\s\S]*\}/);
  if (match) {
    const extracted = tryParse(match[0]);
    if (extracted) return extracted;
  }

  return null;
}

async function callOmlx(baseURL: string, model: string, title: string, source: string): Promise<string> {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `标题：${title}\n来源：${source}` },
      ],
      max_tokens: 300,
      temperature: 0.3,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });

  if (!res.ok) {
    throw new Error(`oMLX responded with ${res.status}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content?.trim() || '';
}

const MAX_RETRIES = 2;

async function generateSummary(
  client: OpenAI,
  title: string,
  source: string,
  model: string,
  isOmlx: boolean,
): Promise<AIGenerated | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let content: string;

      if (isOmlx) {
        const baseURL = process.env.OMLX_BASE_URL || 'http://localhost:8000/v1';
        content = await callOmlx(baseURL, model, title, source);
      } else {
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `标题：${title}\n来源：${source}` },
          ],
          max_tokens: 300,
          temperature: 0.3,
        });
        content = response.choices[0]?.message?.content?.trim() || '';
      }

      const result = parseAIResponse(content);
      if (result) return result;

      console.warn(`Attempt ${attempt + 1}: parsed result has no Chinese content for "${title.slice(0, 50)}"`);
    } catch (err) {
      console.error(`Attempt ${attempt + 1} failed for "${title.slice(0, 50)}":`, (err as Error).message);
    }
  }

  console.error(`All ${MAX_RETRIES + 1} attempts failed for "${title.slice(0, 50)}", skipping.`);
  return null;
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log('Fetching AI news...');

  const [hnItems, rundownItems, tldrItems, rssItems] = await Promise.all([
    fetchHackerNews().catch((err) => { console.error('HN failed:', err.message); return []; }),
    fetchTheRundownAI().catch((err) => { console.error('The Rundown AI failed:', err.message); return []; }),
    fetchTLDR().catch((err) => { console.error('TLDR failed:', err.message); return []; }),
    fetchRSSFeeds().catch((err) => { console.error('RSS failed:', err.message); return []; }),
  ]);

  console.log(`Raw items: HN=${hnItems.length}, Rundown=${rundownItems.length}, TLDR=${tldrItems.length}, RSS=${rssItems.length}`);

  const merged = [
    ...hnItems.map((i) => ({ ...i, source: 'Hacker News', sourceIcon: 'hn' })),
    ...rundownItems.map((i) => ({ ...i, source: 'The Rundown AI', sourceIcon: 'rundown' })),
    ...tldrItems.map((i) => ({ ...i, source: 'TLDR AI', sourceIcon: 'tldr' })),
    ...rssItems.map((i) => ({ ...i, source: i.source || 'RSS', sourceIcon: 'rss' })),
  ];

  const unique = dedup(merged);
  const recent = filterByRecency(unique, 24);
  const TARGET_COUNT = 20;
  const candidates = selectTopStories(recent, 30, 6);
  console.log(`${candidates.length} candidates selected (from ${unique.length} unique, ${recent.length} within 24h, source-capped at 6)`);

  const { client, model } = createAIClient();
  const provider = process.env.AI_PROVIDER || 'omlx';
  const isOmlx = provider === 'omlx';

  console.log(`Using AI provider: ${provider}, model: ${model}`);

  const stories: Story[] = [];
  for (let i = 0; i < candidates.length && stories.length < TARGET_COUNT; i++) {
    const item = candidates[i];
    console.log(`[${stories.length + 1}→${TARGET_COUNT}] [${i + 1}/${candidates.length}] Summarizing: ${item.title.slice(0, 60)}...`);
    const result = await generateSummary(client, item.title, item.source, model, isOmlx);
    if (!result) continue;
    stories.push({
      id: stories.length + 1,
      title: item.title,
      titleCN: result.titleCN,
      url: item.url,
      source: item.source,
      sourceIcon: item.sourceIcon,
      pubDate: item.pubDate,
      summary: result.summary,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const data: DailyData = {
    date: today,
    lastUpdate: new Date().toISOString(),
    stories,
  };

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const outPath = resolve(DATA_DIR, `${today}.json`);
  writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\nDone! Written ${stories.length} stories to ${outPath}${stories.length < TARGET_COUNT ? ` (target was ${TARGET_COUNT})` : ''}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
