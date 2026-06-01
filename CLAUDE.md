# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Daily News (AI 日报) — a daily AI news aggregation site built with Astro (SSG). Fetches news from 4 source types (Hacker News, The Rundown AI, TLDR AI, RSS feeds including TechCrunch/VentureBeat), ranks by score with source diversity, generates compelling Chinese titles and summaries via oMLX (local) or DeepSeek API, and deploys as static pages to Cloudflare Pages.

UI and content are entirely in Chinese, targeting domestic Chinese readers. Visual design supports both dark and light themes via `[data-theme="light"]` toggle (persisted in localStorage). Dark theme: deep blue-black background with purple/cyan accents, grid pattern, ambient gradients, animated card hover effects. Light theme: clean white/light gray with matching accent colors. Theme is toggled via a sun/moon button in the header, with a blocking inline script in `<head>` to prevent flash of wrong theme on load.

Inspired by [news.stormzhang.ai](https://news.stormzhang.ai/).

## Commands

```bash
pnpm install              # Install dependencies
pnpm fetch-news           # Fetch news + generate summaries (uses oMLX by default)
pnpm dev                  # Dev server (localhost:4321)
pnpm build                # Production build → dist/
pnpm preview              # Preview production build on localhost:4321

# Fetch with DeepSeek instead of oMLX
AI_PROVIDER=deepseek DEEPSEEK_API_KEY=sk-xxx pnpm fetch-news
```

## Architecture

**Two-phase data pipeline:**

1. **`scripts/fetch-news.ts`** — Run daily (manually or via GitHub Actions). Fetches from 4 source types in parallel (HN API top 200, The Rundown AI sitemap, TLDR AI page scraping, RSS feeds including TechCrunch/VentureBeat), filters by AI keyword regex, deduplicates by URL hostname+pathname, sorts by score, selects top 20 with source diversity (max 6 per source), generates Chinese titles and summaries via OpenAI-compatible API (oMLX or DeepSeek). Writes `src/data/news/{YYYY-MM-DD}.json`.

2. **Astro build** — `src/content.config.ts` uses Astro's glob loader to read all JSON files from `src/data/news/`. Pages are generated at build time: index (latest day), `/archive/{date}/`, and `/rss.xml`. Pure static output — no server runtime.

**AI provider switching:** Controlled by `AI_PROVIDER` env var. oMLX (local macOS, `localhost:8000/v1`) for development — uses native `fetch()` (not OpenAI SDK) because Qwen3 requires `chat_template_kwargs: { enable_thinking: false }` to suppress thinking output. DeepSeek API uses OpenAI SDK for production CI.

## Data Format

Each `src/data/news/{date}.json` contains:

```json
{
  "date": "2026-05-17",
  "lastUpdate": "2026-05-17T06:49:00Z",
  "stories": [
    {
      "id": 1,
      "title": "Original English title",
      "titleCN": "AI 中文标题，包含关键人名/公司名，突出核心事件",
      "url": "https://...",
      "source": "Hacker News",
      "sourceIcon": "hn",
      "pubDate": "2026-05-17T06:49:00Z",
      "summary": "AI 生成的中文摘要，补充标题未说清的细节"
    }
  ]
}
```

`sourceIcon` values: `hn` (orange), `rss` (cyan), `rundown` (amber), `tldr` (green).

## Key Files

- `scripts/fetch-news.ts` — All data fetching, filtering, dedup, score sorting, source diversity, and AI summarization logic
- `src/content.config.ts` — Astro content collection schema (zod validation, includes `titleCN` optional field)
- `src/pages/index.astro` — Homepage showing latest day's stories + archive links
- `src/pages/archive/[date].astro` — Individual date archive pages
- `src/pages/rss.xml.ts` — RSS feed output (uses `titleCN` or `summary` as feed title)
- `src/components/NewsCard.astro` — News card with Chinese title, summary, English original title
- `src/components/SourceBadge.astro` — Color-coded source badges
- `src/styles/global.css` — Dual theme (dark/light) CSS custom properties, grid background, ambient gradients, card animations, theme toggle styles
- `src/layouts/BaseLayout.astro` — Base layout with "AI 日报" branding, theme toggle button, flash-prevention inline script
- `.github/workflows/daily-build.yml` — Daily cron (UTC 05:00) fetches news, builds, deploys to Cloudflare Pages

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `AI_PROVIDER` | `omlx` or `deepseek` | `omlx` |
| `OMLX_BASE_URL` | Local oMLX server | `http://localhost:8000/v1` |
| `OMLX_MODEL` | oMLX model name | `gemma-4-26B-A4B-it-OptiQ-4bit` |
| `DEEPSEEK_API_KEY` | DeepSeek API key | — |

## Deployment

GitHub Actions runs daily at UTC 05:00: fetch news (using DeepSeek), build static site, deploy to Cloudflare Pages via `wrangler`. Requires `DEEPSEEK_API_KEY` and `CLOUDFLARE_API_TOKEN` as GitHub secrets.

## Conventions

- Language: UI and summaries are in Chinese; source code comments in English
- Node >= 22.12.0, pnpm as package manager
- Astro static output (SSG), no SSR or serverless
- No test framework currently configured
- Environment variables are loaded via `dotenv` from `.env` file
- oMLX calls must use native `fetch()`, not OpenAI SDK (due to `chat_template_kwargs` parameter)
- Top 3 stories in the list get accent styling (permanent subtle glow, accent-colored index)
- Dual theme support: dark (default) and light mode, toggled via header button, persisted in localStorage with system preference detection
