# DuckDuckGo API & 网页爬取工具

这个项目提供了两个主要功能：一个基于DuckDuckGo的搜索API和一个网页内容提取工具。

## 功能

### 搜索 API
使用DuckDuckGo搜索引擎提取搜索结果，返回JSON格式的结构化数据。

### 网页提取 API
提取网页主要内容，去除广告、导航和其他非核心内容，返回纯文本结果。

## API 端点

### 1. 搜索 API
```
GET /search?query=关键词&max_results=10
```

**参数：**
- `query` (必需)：搜索关键词
- `max_results` (可选)：返回的最大结果数，默认为10

**响应示例：**
```json
{
  "results": [
    {
      "title": "搜索结果标题",
      "link": "https://example.com/page",
      "snippet": "结果摘要...",
      "position": 1
    },
    ...
  ],
  "count": 10
}
```

### 2. 网页提取 API
```
GET /fetch?url=https://example.com/article
```

**参数：**
- `url` (必需)：要提取内容的网页URL

**响应示例：**
```json
{
  "url": "https://example.com/article",
  "content": "提取的正文内容...",
  "length": 2062
}
```

## 使用示例

### 搜索示例
```bash
curl "https://your-worker.workers.dev/search?query=cloudflare+workers"
```

### 网页提取示例
```bash
curl "https://your-worker.dev/fetch?url=https://news.ycombinator.com/item?id=123456"
```

## 部署说明

此项目设计用于Cloudflare Workers环境：

1. 安装Wrangler CLI工具
   ```
   npm install -g wrangler
   ```

2. 配置wrangler.toml文件

3. 部署到Cloudflare
   ```
   wrangler deploy
   ```

## 限制说明

- 遵守DuckDuckGo的使用条款
- 网页提取功能可能对某些网站的布局无效
- 请合理控制请求频率
