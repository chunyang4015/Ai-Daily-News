# 部署指南

## Cloudflare Pages 部署

### 方式一：GitHub Actions 自动部署（推荐）

项目已配置 `.github/workflows/daily-build.yml`，每日 UTC 05:00（北京时间 13:00）自动执行：

1. 抓取新闻并生成中文标题和摘要
2. 构建静态站点
3. 部署到 Cloudflare Pages

#### 前置准备

1. **GitHub 仓库**：推送代码到 GitHub
2. **DeepSeek API Key**：从 [platform.deepseek.com](https://platform.deepseek.com/api_keys) 获取
3. **Cloudflare API Token**：从 Cloudflare Dashboard → My Profile → API Tokens 创建，需要 `Cloudflare Pages:Edit` 权限

#### 配置 Secrets

在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：

| Secret 名称 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |

#### 手动触发

在 GitHub Actions 页面点击 "Run workflow" 可手动触发构建。

### 方式二：Cloudflare Pages 直连 GitHub

1. 登录 Cloudflare Dashboard → Pages → Create a project
2. 连接 GitHub 仓库
3. 配置构建：
   - Framework preset: `Astro`
   - Build command: `pnpm build`
   - Output directory: `dist`
4. 添加环境变量（Settings → Environment variables）：
   - `DEEPSEEK_API_KEY`

注意：这种方式需要先在本地或其他地方运行 `pnpm fetch-news` 生成数据文件后再推送，因为 Cloudflare Pages 构建时不会自动抓取新闻。

## 自定义域名

在 Cloudflare Pages 项目设置 → Custom domains 中添加域名。

## 本地预览

```bash
pnpm build
pnpm preview
```

`pnpm preview` 会在 `localhost:4321` 启动预览服务器。
