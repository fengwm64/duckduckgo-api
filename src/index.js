const SERVICE_NAME = "duckduckgo-api";
const SERVICE_VERSION = "0.1.0";
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_LIMIT = 20;
const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html";
const REQUEST_HEADERS = {
  "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
};
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type"
};

function withCorsHeaders(headers = {}) {
  return {
    ...CORS_HEADERS,
    ...headers
  };
}

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: withCorsHeaders({
      "content-type": "application/json; charset=utf-8",
      ...headers
    })
  });
}

function errorResponse(message, status = 400, extra = {}) {
  return jsonResponse(
    {
      error: message,
      ...extra
    },
    status
  );
}

function methodNotAllowed(allowedMethods) {
  return errorResponse("Method not allowed", 405, {
    allow: allowedMethods
  });
}

function stripHtml(value) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function parseMaxResults(value) {
  if (value == null) {
    return DEFAULT_MAX_RESULTS;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_RESULTS_LIMIT) {
    return null;
  }

  return parsed;
}

function normalizeSearchResultLink(rawHref) {
  const href = decodeHtmlEntities(rawHref).trim();

  if (!href) {
    return "";
  }

  try {
    const url = new URL(href, DUCKDUCKGO_HTML_URL);
    const target = url.searchParams.get("uddg");

    if (target) {
      return decodeURIComponent(target);
    }

    return url.toString();
  } catch {
    return href;
  }
}

function extractSearchResults(html, maxResults) {
  const titleMatches = html.matchAll(
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  );
  const snippetMatches = Array.from(
    html.matchAll(/<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/g),
    ([, snippetHtml]) => stripHtml(snippetHtml)
  );
  const results = [];
  const seenLinks = new Set();

  for (const [, rawHref, rawTitle] of titleMatches) {
    if (results.length >= maxResults) {
      break;
    }

    const title = stripHtml(rawTitle);
    const link = normalizeSearchResultLink(rawHref);

    if (!title || !link || seenLinks.has(link)) {
      continue;
    }

    seenLinks.add(link);

    results.push({
      title,
      link,
      snippet: snippetMatches[results.length] || "",
      position: results.length + 1
    });
  }

  return results;
}

function cleanContent(content) {
  return decodeHtmlEntities(
    content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<h[1-6][^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractMainContent(html) {
  const preferredContainers = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*\bmain\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  ];

  for (const pattern of preferredContainers) {
    const match = html.match(pattern);

    if (match?.[1]) {
      const content = cleanContent(match[1]);

      if (content) {
        return content;
      }
    }
  }

  let simplifiedHtml = html;

  for (const pattern of [
    /<header[^>]*>[\s\S]*?<\/header>/gi,
    /<nav[^>]*>[\s\S]*?<\/nav>/gi,
    /<footer[^>]*>[\s\S]*?<\/footer>/gi,
    /<aside[^>]*>[\s\S]*?<\/aside>/gi,
    /<!--[\s\S]*?-->/g
  ]) {
    simplifiedHtml = simplifiedHtml.replace(pattern, "");
  }

  return cleanContent(simplifiedHtml);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function handleRoot(request) {
  const url = new URL(request.url);

  return jsonResponse({
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
    domain: url.origin,
    endpoints: {
      health: "/health",
      search: "/search?query=cloudflare+workers&max_results=5",
      fetch: "/fetch?url=https://example.com"
    }
  });
}

function handleHealth() {
  return jsonResponse({
    ok: true,
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString()
  });
}

async function handleSearch(url) {
  const query = url.searchParams.get("query")?.trim();
  const maxResults = parseMaxResults(url.searchParams.get("max_results"));

  if (!query) {
    return errorResponse("Missing query parameter", 400);
  }

  if (maxResults == null) {
    return errorResponse("max_results must be an integer between 1 and 20", 400);
  }

  const upstreamResponse = await fetch(DUCKDUCKGO_HTML_URL, {
    method: "POST",
    headers: REQUEST_HEADERS,
    body: new URLSearchParams({
      q: query
    })
  });

  if (!upstreamResponse.ok) {
    return errorResponse("DuckDuckGo upstream request failed", 502, {
      upstream_status: upstreamResponse.status
    });
  }

  const html = await upstreamResponse.text();
  const results = extractSearchResults(html, maxResults);

  return jsonResponse({
    query,
    count: results.length,
    results
  });
}

async function handleFetch(url) {
  const targetUrl = url.searchParams.get("url")?.trim();

  if (!targetUrl) {
    return errorResponse("Missing url parameter", 400);
  }

  if (!isHttpUrl(targetUrl)) {
    return errorResponse("url must be a valid http or https address", 400);
  }

  const upstreamResponse = await fetch(targetUrl, {
    headers: {
      "user-agent": REQUEST_HEADERS["user-agent"]
    }
  });

  if (!upstreamResponse.ok) {
    return errorResponse("Failed to fetch upstream content", 502, {
      upstream_status: upstreamResponse.status
    });
  }

  const contentType = upstreamResponse.headers.get("content-type") || "";
  const rawContent = await upstreamResponse.text();

  if (!contentType.includes("text/html")) {
    return jsonResponse({
      url: targetUrl,
      content: rawContent,
      content_type: contentType || "text/plain",
      length: rawContent.length
    });
  }

  const content = extractMainContent(rawContent);

  return jsonResponse({
    url: targetUrl,
    content,
    content_type: contentType,
    length: content.length
  });
}

async function routeRequest(request) {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;

  console.log(`[duckduckgo-api] ${route}`);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCorsHeaders()
    });
  }

  if (url.pathname === "/") {
    return request.method === "GET" ? handleRoot(request) : methodNotAllowed(["GET", "OPTIONS"]);
  }

  if (url.pathname === "/health") {
    return request.method === "GET" ? handleHealth() : methodNotAllowed(["GET", "OPTIONS"]);
  }

  if (url.pathname === "/search") {
    return request.method === "GET" ? handleSearch(url) : methodNotAllowed(["GET", "OPTIONS"]);
  }

  if (url.pathname === "/fetch") {
    return request.method === "GET" ? handleFetch(url) : methodNotAllowed(["GET", "OPTIONS"]);
  }

  return errorResponse("Not Found", 404);
}

const worker = {
  async fetch(request) {
    try {
      return await routeRequest(request);
    } catch (error) {
      console.error("[duckduckgo-api] unhandled error", error);
      return errorResponse("Internal server error", 500);
    }
  }
};

export default worker;
