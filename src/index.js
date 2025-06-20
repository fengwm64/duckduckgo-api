addEventListener('fetch', (event) => {
	event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
	const url = new URL(request.url);
	console.log(`请求: ${url.pathname}`);

	if (url.pathname === '/search') {
		return await handleSearchRequest(url.searchParams);
	} else if (url.pathname === '/fetch') {
		return await handleFetchRequest(url.searchParams);
	}

	return new Response('Not Found', { status: 404 });
}

async function handleSearchRequest(params) {
	const query = params.get('query');
	const maxResults = parseInt(params.get('max_results') || 10);

	console.log(`查询: "${query}" (限制:${maxResults})`);

	if (!query) {
		return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		const response = await fetch('https://html.duckduckgo.com/html', {
			method: 'POST',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
			},
			body: new URLSearchParams({
				q: query,
				b: '',
				kl: '',
			}),
		});

		console.log(`DuckDuckGo API 响应状态码: ${response.status}`);
		const text = await response.text();
		console.log(`获取到的HTML长度: ${text.length}字节`);
		
		// 直接提取所有结果标题和链接
		const results = extractSearchResultsSimple(text, maxResults);

		return new Response(
			JSON.stringify({
				results,
				count: results.length,
			}),
			{
				headers: { 'Content-Type': 'application/json' },
			}
		);
	} catch (error) {
		console.error(`搜索请求出错: ${error.message}`);
		return new Response(JSON.stringify({ error: `An error occurred: ${error.message}` }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

function extractSearchResultsSimple(html, maxResults) {
	console.log(`使用简化方法提取搜索结果, 最大数量: ${maxResults}`);
	const results = [];
	
	// 提取标题和链接
	const titleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g;
	
	// 提取所有摘要
	const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
	const snippets = [];
	let snippetMatch;
	
	while ((snippetMatch = snippetRegex.exec(html)) !== null) {
		const snippet = snippetMatch[1].replace(/<[^>]*>/g, '').trim();
		snippets.push(snippet);
		console.log(`找到摘要: "${snippet.substring(0, 50)}${snippet.length > 50 ? '...' : ''}"`);
	}
	
	console.log(`共找到 ${snippets.length} 个摘要`);
	
	// 提取标题和链接，并将其与摘要关联
	let titleMatch;
	let count = 0;
	
	while ((titleMatch = titleRegex.exec(html)) !== null && count < maxResults) {
		const link = titleMatch[1];
		const title = titleMatch[2].replace(/<[^>]*>/g, '').trim();
		
		// 使用相应索引的摘要（如果可用）
		const snippet = count < snippets.length ? snippets[count] : '';
		
		console.log(`[结果 ${count + 1}] 标题: "${title.substring(0, 30)}${title.length > 30 ? '...' : ''}", 链接: ${link}`);
		
		if (title && link) {
			results.push({
				title,
				link,
				snippet,
				position: count + 1,
			});
			count++;
		}
	}
	
	console.log(`成功提取 ${results.length} 个搜索结果`);
	return results;
}

// 辅助函数：转义正则表达式特殊字符
function escapeRegExp(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 处理网页内容获取请求
 * @param {URLSearchParams} params 请求参数
 * @returns {Response} 响应对象
 */
async function handleFetchRequest(params) {
	const url = params.get('url');
	
	console.log(`爬取: "${url}"`);
	
	if (!url) {
		return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
			},
		});
		
		console.log(`请求状态码: ${response.status}`);
		
		if (!response.ok) {
			throw new Error(`请求失败: ${response.status}`);
		}
		
		const contentType = response.headers.get('content-type') || '';
		if (!contentType.includes('text/html')) {
			// 如果不是HTML，直接返回原始内容
			const content = await response.text();
			return new Response(JSON.stringify({
				url,
				content,
				length: content.length
			}), {
				headers: { 'Content-Type': 'application/json' }
			});
		}
		
		const html = await response.text();
		console.log(`获取到的HTML长度: ${html.length}字节`);
		
		// 提取主体内容
		const mainContent = extractMainContent(html);
		
		return new Response(JSON.stringify({
			url,
			content: mainContent,
			length: mainContent.length
		}), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error(`爬取失败: ${error.message}`);
		return new Response(JSON.stringify({ error: `Failed to fetch content: ${error.message}` }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

/**
 * 从HTML中提取主体内容
 * @param {string} html HTML内容
 * @returns {string} 主体内容
 */
function extractMainContent(html) {
	// 尝试找到常见的主内容容器
	const contentPatterns = [
		/<article[^>]*>([\s\S]*?)<\/article>/i,
		/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
		/<div[^>]*class="[^"]*main[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
		/<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
		/<div[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
		/<div[^>]*class="[^"]*entry[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
	];
	
	for (const pattern of contentPatterns) {
		const match = html.match(pattern);
		if (match) {
			console.log(`使用模式提取到内容`);
			// 清理提取的内容
			return cleanContent(match[1]);
		}
	}
	
	// 如果没有找到特定的内容容器，尝试去除导航、页眉、页脚等
	let content = html;
	
	// 移除常见的非内容区域
	const elementsToRemove = [
		/<header[^>]*>[\s\S]*?<\/header>/gi,
		/<nav[^>]*>[\s\S]*?<\/nav>/gi,
		/<footer[^>]*>[\s\S]*?<\/footer>/gi,
		/<script[^>]*>[\s\S]*?<\/script>/gi,
		/<style[^>]*>[\s\S]*?<\/style>/gi,
		/<aside[^>]*>[\s\S]*?<\/aside>/gi,
		/<form[^>]*>[\s\S]*?<\/form>/gi,
		/<!--[\s\S]*?-->/g,
		/<div[^>]*class="[^"]*comment[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
		/<div[^>]*class="[^"]*sidebar[^"]*"[^>]*>[\sS]*?<\/div>/gi,
		/<div[^>]*class="[^"]*menu[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
		/<div[^>]*class="[^"]*nav[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
		/<div[^>]*class="[^"]*ad[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
	];
	
	for (const pattern of elementsToRemove) {
		content = content.replace(pattern, '');
	}
	
	console.log(`移除非内容区域后长度: ${content.length}字节`);
	return cleanContent(content);
}

/**
 * 清理HTML内容，去除多余标签，保留基本格式
 * @param {string} content HTML内容
 * @returns {string} 清理后的内容
 */
function cleanContent(content) {
	// 保留段落、标题、列表等基本格式，但删除其他标签属性
	let result = content
		// 替换常见格式标签为纯文本版本
		.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, "\n\n$1\n\n")
		.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
		.replace(/<br[^>]*>/gi, "\n")
		.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "• $1\n")
		.replace(/<\/ul>|<\/ol>/gi, "\n")
		// 删除所有剩余的HTML标签
		.replace(/<[^>]+>/g, "")
		// 处理HTML实体
		.replace(/&nbsp;/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, "\"")
		// 删除多余空格和空行
		.replace(/\n\s*\n/g, "\n\n")
		.replace(/^\s+|\s+$/g, "");
	
	return result;
}

/**
 * 从HTML中提取页面标题
 * @param {string} html HTML内容
 * @returns {string} 页面标题
 */
function extractTitle(html) {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	return match ? match[1].trim() : "";
}