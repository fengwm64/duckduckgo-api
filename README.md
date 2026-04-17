# DuckDuckGo API

基于 Cloudflare Workers 的轻量接口，提供 DuckDuckGo 搜索结果提取、网页正文抓取，以及健康检查。

## API

### `GET /health`

返回服务状态。

```json
{
  "ok": true,
  "name": "duckduckgo-api",
  "version": "0.1.0",
  "timestamp": "2026-04-17T14:00:00.000Z"
}
```

### `GET /search?query=关键词&max_results=10`

- `query`：必填，搜索关键词
- `max_results`：可选，范围 `1-20`，默认 `10`

```json
{
  "query": "cloudflare",
  "count": 1,
  "results": [
    {
      "title": "Cloudflare Docs",
      "link": "https://developers.cloudflare.com",
      "snippet": "Cloudflare documentation home.",
      "position": 1
    }
  ]
}
```

### `GET /fetch?url=https://example.com/article`

- `url`：必填，仅支持 `http` / `https`

```json
{
  "url": "https://example.com/article",
  "content": "提取的正文内容...",
  "content_type": "text/html; charset=utf-8",
  "length": 2062
}
```

## 使用

```bash
npm install
npm test
npm run deploy
```

## 域名与部署

- 自定义域名：`https://duckapi.102465.xyz`
- Wrangler 配置已切换到 `wrangler.toml`
- 已开启 Smart Placement、日志和 traces

## 示例

```bash
curl "https://duckapi.102465.xyz/health"
curl "https://duckapi.102465.xyz/search?query=cloudflare+workers&max_results=5"
curl "https://duckapi.102465.xyz/fetch?url=https://news.ycombinator.com/item?id=123456"
```
