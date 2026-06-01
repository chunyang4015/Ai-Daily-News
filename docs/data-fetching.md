# 数据抓取

## 新闻来源

### Hacker News

- API：`https://hacker-news.firebaseio.com/v0/`
- 流程：获取 `topstories.json`（最多 500 条 ID）→ 取前 200 条 → 逐条获取详情 → AI 关键词过滤 → 记录 `score`
- 无需认证，无速率限制
- score 用于后续排序，高 score 新闻优先展示

### Reddit

- 方式：JSON API（`https://www.reddit.com/r/{subreddit}/new.json?limit=25`）
- 子版块：`artificial`、`LocalLLaMA`、`ChatGPT`、`ClaudeAI`、`OpenAI`、`singularity`
- 无需 OAuth，通过 JSON API 直接读取
- 需要设置 User-Agent 头（`ai-daily-news/1.0`）
- 记录帖子 score 用于排序

> 注意：Reddit RSS（`old.reddit.com`）会返回 403，已改用 JSON API。

### The Rundown AI

- 方式：抓取 `https://www.therundown.ai/sitemap.xml`，提取最近 10 篇文章 URL
- 将 URL slug 转换为标题（`slugToTitle()` 函数）
- 固定 score = 50

> 注意：The Rundown AI 页面有 Cloudflare 保护，无法直接抓取页面内容，因此使用 sitemap.xml。

### TLDR AI

- 方式：抓取 `https://tldr.tech/tech/{YYYY-MM-DD}` 最近 3 天的页面
- 从 HTML 中提取 `<h3>` 标签内容作为标题
- 过滤掉过短的标题（< 15 字符）和赞助内容
- 固定 score = 30

### 通用 RSS

| 来源 | RSS URL |
|---|---|
| TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/feed/` |
| HN RSS (AI) | `https://hnrss.org/newest?q=AI` |
| The Verge AI | `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` |
| VentureBeat AI | `https://venturebeat.com/category/ai/feed/` |
| Product Hunt | `https://www.producthunt.com/feed` |

固定 score = 20。使用 `rss-parser` 库解析。

## 过滤逻辑

使用正则匹配 AI 相关关键词：

```
/AI|LLM|GPT|Claude|OpenAI|Gemini|DeepSeek|Anthropic|machine.?learning|
 deep.?learning|neural|transformer|AGI|Mistral|Llama|ChatGPT|Copilot|
 Sora|Midjourney|Stable.?Diffusion|AIGC|generative.?AI/i
```

## 去重

按 URL 的 `hostname + pathname` 去重，同一篇文章只保留一条。

## 排序与筛选

`selectTopStories()` 函数：

1. 所有来源的新闻按 `score` 降序排列
2. 依次选取，每种来源最多 6 条（防止单一来源垄断）
3. 取前 20 条

## AI 摘要生成

### DeepSeek（生产环境）

- API：`https://api.deepseek.com`（兼容 OpenAI SDK）
- 模型：`deepseek-chat`
- 使用 OpenAI SDK 调用

### oMLX（本地开发，macOS）

- 地址：`http://localhost:8000/v1`
- 模型：`Qwen3.6-35B-A3B-4bit`（默认）
- 基于 Apple MLX 框架，Apple Silicon 上推理速度快
- **必须使用原生 `fetch()` 调用**（不能使用 OpenAI SDK），因为需要传递 `chat_template_kwargs: { enable_thinking: false }` 来禁止 Qwen3 的 thinking 模式输出
- 超时设置：120 秒（`AbortSignal.timeout(120_000)`）

### 摘要 Prompt

```
你是一个资深科技媒体编辑，擅长写出有吸引力的 AI 新闻标题和摘要。

用户会给你一条英文 AI 新闻标题和来源。你需要：

1. 生成中文标题（不超过 40 字），要求：
   - 必须包含关键人名或公司名（如 Karpathy、OpenAI、Google 等）
   - 点出核心事件，突出影响或冲突
   - 像科技媒体头条，有信息量和吸引力，不要平淡直译

2. 生成中文摘要（40-60 字），要求：
   - 补充标题没说清的细节：具体能力、数据、行业影响
   - 要有具体信息点，不要空泛概括

严格按 JSON 格式输出：{"title":"中文标题","summary":"中文摘要"}
```

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `AI_PROVIDER` | AI 提供商：`omlx` / `deepseek` | `omlx` |
| `OMLX_BASE_URL` | oMLX 服务地址 | `http://localhost:8000/v1` |
| `OMLX_MODEL` | oMLX 模型名称 | `Qwen3.6-35B-A3B-4bit` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | - |

## 命令

```bash
# 使用 oMLX 本地模型抓取（默认）
pnpm fetch-news

# 使用 DeepSeek 云端 API 抓取
AI_PROVIDER=deepseek DEEPSEEK_API_KEY=sk-xxx pnpm fetch-news
```
