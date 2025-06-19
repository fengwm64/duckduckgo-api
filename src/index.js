/**
 * DuckDuckGo API - CloudFlare Workers实现
 * 提供网页搜索和内容获取功能
 */

// 路由处理
const apiRouter = {
  async handle(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理OPTIONS请求，用于CORS预检
    if (request.method === 'OPTIONS') {
      return this.handleCORS();
    }

    try {
      if (path === '/search') {
        return await this.handleSearch(request, url);
      } else if (path === '/fetch') {
        return await this.handleFetch(request, url);
      } else if (path === '/') {
        return this.handleRoot();
      } else {
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error(`处理请求错误: ${error.message}`);
      return new Response(JSON.stringify({ error: `处理请求失败: ${error.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...this.corsHeaders() }
      });
    }
  },

  async handleSearch(request, url) {
    const query = url.searchParams.get('query');
    const maxResults = parseInt(url.searchParams.get('max_results') || '10');

    if (!query) {
      return new Response(JSON.stringify({ error: '必须提供搜索查询参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...this.corsHeaders() }
      });
    }

    const results = await webCrawler.search(query, maxResults);
    return new Response(JSON.stringify({ results, count: results.length }), {
      headers: { 'Content-Type': 'application/json', ...this.corsHeaders() }
    });
  },

  async handleFetch(request, url) {
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: '必须提供URL参数' }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json', ...this.corsHeaders() }
      });
    }

    try {
      new URL(targetUrl); // 验证URL是否有效
    } catch (error) {
      return new Response(JSON.stringify({ error: '提供的URL无效' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...this.corsHeaders() }
      });
    }

    const content = await webCrawler.fetchContent(targetUrl);
    return new Response(JSON.stringify({ 
      url: targetUrl, 
      content, 
      length: content.length 
    }), {
      headers: { 'Content-Type': 'application/json', ...this.corsHeaders() }
    });
  },

  handleRoot() {
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>DuckDuckGo API</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>DuckDuckGo API</h1>
        <p>提供网页搜索和内容获取的API</p>
        
        <h2>API端点:</h2>
        <h3>1. 搜索</h3>
        <pre>GET /search?query=您的搜索查询&max_results=10</pre>
        
        <h3>2. 内容获取</h3>
        <pre>GET /fetch?url=https://example.com</pre>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html', ...this.corsHeaders() }
    });
  },

  handleCORS() {
    return new Response(null, {
      status: 204,
      headers: this.corsHeaders()
    });
  },

  corsHeaders() {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }
};

// 速率限制器
class RateLimiter {
  constructor(requestsPerMinute = 30) {
    this.requestsPerMinute = requestsPerMinute;
    this.requests = [];
  }

  async acquire() {
    const now = Date.now();
    // 移除超过1分钟的请求
    this.requests = this.requests.filter(time => now - time < 60000);

    if (this.requests.length >= this.requestsPerMinute) {
      // 计算需要等待的时间
      const waitTime = 60000 - (now - this.requests[0]);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    this.requests.push(Date.now());
  }
}

// 网页爬虫类
class WebCrawler {
  constructor(searchRateLimit = 30, fetchRateLimit = 20) {
    this.SEARCH_BASE_URL = "https://html.duckduckgo.com/html";
    this.HEADERS = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    };
    this.searchLimiter = new RateLimiter(searchRateLimit);
    this.fetchLimiter = new RateLimiter(fetchRateLimit);
  }

  async search(query, maxResults = 10) {
    try {
      // 应用速率限制
      await this.searchLimiter.acquire();

      console.log(`正在搜索DuckDuckGo: ${query}`);

      // 创建表单数据
      const formData = new URLSearchParams();
      formData.append("q", query);
      formData.append("b", "");
      formData.append("kl", "");

      const response = await fetch(this.SEARCH_BASE_URL, {
        method: 'POST',
        headers: this.HEADERS,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }

      const html = await response.text();
      const results = this.parseSearchResults(html, maxResults);

      console.log(`成功找到 ${results.length} 条结果`);
      return results;
    } catch (error) {
      console.error(`搜索过程中发生错误: ${error.message}`);
      return [];
    }
  }

  parseSearchResults(html, maxResults) {
    const results = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const resultElements = doc.querySelectorAll('.result');

    for (const result of resultElements) {
      if (results.length >= maxResults) break;

      const titleElem = result.querySelector('.result__title');
      if (!titleElem) continue;

      const linkElem = titleElem.querySelector('a');
      if (!linkElem) continue;

      const title = linkElem.textContent.trim();
      let link = linkElem.getAttribute('href') || '';

      // 跳过广告结果
      if (link.includes('y.js')) continue;

      // 清理DuckDuckGo重定向URL
      if (link.startsWith('//duckduckgo.com/l/?uddg=')) {
        const uddgParam = link.split('uddg=')[1]?.split('&')[0];
        if (uddgParam) {
          link = decodeURIComponent(uddgParam);
        }
      }

      const snippetElem = result.querySelector('.result__snippet');
      const snippet = snippetElem ? snippetElem.textContent.trim() : '';

      results.push({
        title,
        link,
        snippet,
        position: results.length + 1
      });
    }

    return results;
  }

  async fetchContent(url) {
    try {
      await this.fetchLimiter.acquire();

      console.log(`正在获取内容: ${url}`);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }

      const html = await response.text();
      const cleanedContent = this.cleanHtmlContent(html);

      console.log(`成功获取并解析内容 (${cleanedContent.length} 字符)`);
      return cleanedContent;
    } catch (error) {
      console.error(`获取内容时出错: ${error.message}`);
      return `错误: 获取网页时发生错误 (${error.message})`;
    }
  }

  cleanHtmlContent(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 移除script、style、nav、header、footer元素
    ['script', 'style', 'nav', 'header', 'footer'].forEach(tag => {
      const elements = doc.querySelectorAll(tag);
      elements.forEach(el => el.remove());
    });

    // 获取文本内容
    let text = doc.body.textContent || '';
    
    // 清理文本
    text = text.replace(/\s+/g, ' ').trim();
    
    // 截断过长内容
    if (text.length > 8000) {
      text = text.substring(0, 8000) + '... [内容已截断]';
    }
    
    return text;
  }
}

// 创建全局WebCrawler实例
const webCrawler = new WebCrawler();

// Workers导出
export default {
  async fetch(request, env, ctx) {
    return apiRouter.handle(request, env, ctx);
  },
};
