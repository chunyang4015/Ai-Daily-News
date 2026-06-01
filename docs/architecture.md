# 项目架构

## 目录结构

```
ai-daily-news/
├── scripts/
│   └── fetch-news.ts           # 数据抓取 + AI 摘要脚本
├── src/
│   ├── content.config.ts       # Astro 内容集合定义（含 titleCN 字段）
│   ├── data/news/              # 每日新闻 JSON 数据
│   │   └── 2026-05-17.json
│   ├── pages/
│   │   ├── index.astro         # 首页（今日新闻）
│   │   ├── archive/[date].astro # 历史归档页
│   │   └── rss.xml.ts          # RSS 输出
│   ├── layouts/
│   │   └── BaseLayout.astro    # 全局布局（"AI 日报"品牌）
│   ├── components/
│   │   ├── NewsCard.astro      # 新闻卡片（中文标题 + 摘要 + 英文原标题）
│   │   └── SourceBadge.astro   # 来源标签（6 种颜色）
│   └── styles/
│       └── global.css          # 双主题样式（暗色/亮色）+ 卡片动画
├── public/                     # 静态资源（favicon.svg 等）
├── .github/workflows/          # CI/CD
└── docs/                       # 项目文档
```

## 数据流

```
1. fetch-news.ts（每日定时运行）
   ├── Hacker News API → topstories（top 200）→ 逐条获取 → AI 关键词过滤 → 带 score
   ├── Reddit JSON API → 6 个子版块 → AI 关键词过滤 → 带 score
   ├── The Rundown AI → sitemap.xml → slug 转标题 → AI 关键词过滤
   ├── TLDR AI → tldr.tech 页面 → <h3> 提取 → AI 关键词过滤
   ├── 通用 RSS → TechCrunch / The Verge / VentureBeat / HN RSS
   ├── Product Hunt → RSS
   ├── 合并 → URL 去重 → 按 score 降序 → 来源多样性（每种最多 6 条）→ 取 Top 20
   ├── 调用 oMLX / DeepSeek 生成中文标题 + 中文摘要
   └── 输出 src/data/news/{date}.json

2. Astro 构建时
   ├── content.config.ts 从 JSON 文件加载数据
   ├── 生成首页 + 归档页 + RSS
   └── 输出纯静态 HTML 到 dist/

3. Cloudflare Pages
   └── 全球 CDN 分发静态文件
```

## 数据格式

每条新闻的 JSON 结构：

```json
{
  "id": 1,
  "title": "英文原标题",
  "titleCN": "AI 中文标题，包含关键人名/公司名",
  "url": "https://原文链接",
  "source": "Hacker News",
  "sourceIcon": "hn",
  "pubDate": "2026-05-17T06:49:00Z",
  "summary": "AI 生成的中文摘要，补充标题未说清的细节"
}
```

`sourceIcon` 取值：`hn`（橙色）、`reddit`（红橙色）、`rss`（青色）、`rundown`（琥珀色）、`tldr`（绿色）、`producthunt`（珊瑚色）。

## 页面路由

| 路由 | 说明 |
|---|---|
| `/` | 今日新闻首页 |
| `/archive/{date}/` | 指定日期的归档页 |
| `/rss.xml` | RSS 订阅源 |

## 视觉设计

支持暗色/亮色双主题切换，通过 `[data-theme="light"]` 属性控制。主题偏好保存在 localStorage，首次访问跟随系统偏好。`<head>` 中有阻塞式内联脚本防止主题闪烁。

### 暗色主题（默认）

- **背景**：深蓝黑底色 + 60px 网格图案（径向遮罩）+ 紫色/青色环境光渐变（缓慢漂移动画）
- **卡片**：错落入场动画（30ms 递增延迟）、悬停时渐变背景 + 左侧紫色光条 + 右侧光晕
- **前 3 条**：永久微妙紫色背景 + 序号高亮色
- **来源标签**：6 种颜色，悬停时发光
- **分隔线**：渐变色（透明 → 紫色 → 透明）

### 亮色主题

- **背景**：浅灰白色底色 + 淡紫色网格 + 柔和环境光渐变
- **卡片**：白色卡片，悬停时淡紫色背景 + 光条/光晕效果（降低透明度）
- **主色调**：`--accent: #6c58d8`（稍深紫色，在浅色背景上对比度更好）、`--cyan: #0891b2`

### 主题切换

- **位置**：Header 右侧太阳/月亮图标按钮
- **交互**：点击切换 `data-theme` 属性，图标带旋转+缩放过渡动画
- **持久化**：localStorage 存储 `theme` 值（`dark` / `light`）
- **初始化**：`<head>` 内联脚本在渲染前读取 localStorage + `prefers-color-scheme`，防止闪烁

CSS 变量定义在 `:root` 和 `[data-theme="light"]` 中。暗色主色调：`--accent: #7c6aef`、`--cyan: #22d3ee`。
